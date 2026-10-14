import { createHash } from "crypto";
import { canImportProducts, requireAccess } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { ensureDbReady, firestoreDb, nowIso } from "@/lib/db";
import { actorFromAccess, recordActivity } from "@/lib/db/activity";
import { addProduct, addStock, buildBusinessState, getProducts } from "@/lib/db/queries";
import { sanitizeBusinessState } from "@/lib/permissions";
import {
  importContentKey,
  parseCsvText,
  previewImportRows,
  rowsFromCsvMatrix,
  type ValidImportRow,
} from "@/lib/product-import";
import type { AccessRole, AppState } from "@/lib/types";

export const runtime = "nodejs";

const BATCH = 40;

async function stateFor(businessId: string, role: AccessRole) {
  const state = await buildBusinessState(businessId);
  return state ? sanitizeBusinessState(role, state as AppState) : null;
}

async function parseUpload(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buf, { type: "buffer", codepage: 65001 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as string[][];
    return matrix.map((row) => row.map((cell) => String(cell ?? "")));
  }
  const text = buf.toString("utf8");
  return parseCsvText(text);
}

export async function POST(request: Request) {
  await ensureDbReady();
  const ctx = await requireAccess();
  if (!ctx) return jsonNoStore({ error: "Please log in with WhatsApp first" }, { status: 401 });
  if (!canImportProducts(ctx.role)) {
    return jsonNoStore({ error: "Only owners can import products." }, { status: 403 });
  }

  const form = await request.formData();
  const mode = String(form.get("mode") || "preview");
  const existingMode = String(form.get("existingMode") || "skip") === "add" ? "add" : "skip";
  const importKey = String(form.get("importKey") || "");
  const file = form.get("file");

  if (!(file instanceof File)) {
    return jsonNoStore({ error: "Choose a CSV or Excel file." }, { status: 400 });
  }

  let matrix: string[][];
  try {
    matrix = await parseUpload(file);
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : "Could not read that file." },
      { status: 400 },
    );
  }

  const rows = rowsFromCsvMatrix(matrix);
  const products = await getProducts(ctx.business.id, { includeArchived: false });
  const preview = previewImportRows(rows, products);

  if (mode === "preview") {
    return jsonNoStore({
      preview: {
        readyCount: preview.ready.length,
        problemCount: preview.problems.length,
        existingCount: preview.existing.length,
        problems: preview.problems,
        ready: preview.ready,
        existing: preview.existing,
      },
    });
  }

  if (mode !== "commit") {
    return jsonNoStore({ error: "Unknown import mode." }, { status: 400 });
  }

  const toApply: ValidImportRow[] =
    existingMode === "add" ? [...preview.ready, ...preview.existing] : [...preview.ready];

  if (toApply.length === 0) {
    return jsonNoStore({
      error: "Nothing to import. Fix the problem rows or change how existing products are handled.",
      preview,
    }, { status: 400 });
  }

  const contentKey = importContentKey(toApply, existingMode);
  const keyHash = createHash("sha256").update(`${importKey || file.name}::${contentKey}`).digest("hex");
  const idemRef = firestoreDb()
    .collection("businesses")
    .doc(ctx.business.id)
    .collection("importKeys")
    .doc(keyHash);
  const existingKey = await idemRef.get();
  if (existingKey.exists) {
    return jsonNoStore({
      replayed: true,
      imported: 0,
      skipped: toApply.length,
      failed: preview.problems,
      message: "This file was already imported. No duplicates were created.",
      business: await stateFor(ctx.business.id, ctx.role),
      role: ctx.role,
    });
  }

  let imported = 0;
  const failed: { rowNumber: number; message: string }[] = [...preview.problems];

  for (let i = 0; i < toApply.length; i += BATCH) {
    const batch = toApply.slice(i, i + BATCH);
    for (const row of batch) {
      try {
        if (row.existingProductId && existingMode === "add") {
          if (row.quantity > 0) {
            await addStock(ctx.business.id, {
              productId: row.existingProductId,
              location: row.location,
              quantity: row.quantity,
              idempotencyKey: `import:${keyHash}:row:${row.rowNumber}`,
            });
          }
          imported += 1;
          continue;
        }
        await addProduct(ctx.business.id, {
          name: row.name,
          category: row.category,
          variant: row.variant,
          location: row.location,
          quantity: row.quantity,
          purchasePrice: row.purchasePrice,
          piecesPerCarton: row.piecesPerCarton,
          restockThreshold: row.restockThreshold,
        });
        imported += 1;
      } catch (err) {
        failed.push({
          rowNumber: row.rowNumber,
          message: `Row ${row.rowNumber}: ${err instanceof Error ? err.message : "Could not import this row."}`,
        });
      }
    }
  }

  await idemRef.set({
    keyHash,
    importKey: importKey || null,
    imported,
    createdAt: nowIso(),
    existingMode,
  });

  const actor = actorFromAccess(ctx);
  await recordActivity(ctx.business.id, {
    category: "products",
    action: "product_added",
    actor,
    summary: `Imported ${imported} products`,
    detail: `CSV/Excel import by ${actor.name}; ${imported} succeeded; ${failed.length} failed/skipped problems.`,
  }).catch(() => undefined);

  return jsonNoStore({
    replayed: false,
    imported,
    failed,
    message: `Imported ${imported} products.`,
    business: await stateFor(ctx.business.id, ctx.role),
    role: ctx.role,
  });
}
