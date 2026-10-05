import { NextResponse } from "next/server";
import { databaseIsDurable, ensureDbReady, persistDb, usingTurso } from "@/lib/db";
import { createBusiness, getBusiness, listBusinesses, updateBusiness } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development" || process.env.OTP_DEV_MODE === "1") return true;
    return false;
  }
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

const MARKER_PHONE = "+92 300 0000099";

/**
 * Write/read a durable marker to verify the live DB survives redeploy.
 * Secured like other cron routes (CRON_SECRET).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "write";
  const expected = url.searchParams.get("marker");

  if (mode === "write") {
    const marker = `redeploy-marker-${Date.now()}`;
    const existing = (await listBusinesses()).find((b) => b.owner_whatsapp === MARKER_PHONE);
    if (existing) {
      await updateBusiness(existing.id, { name: marker });
      await persistDb();
      const row = await getBusiness(existing.id);
      return NextResponse.json({
        ok: true,
        mode: "write",
        marker,
        businessId: existing.id,
        name: row?.name ?? null,
        database: usingTurso() ? "turso" : "local-file",
        durable: databaseIsDurable(),
      });
    }

    const created = await createBusiness({
      name: marker,
      language: "en",
      ownerWhatsapp: MARKER_PHONE,
      seedSample: false,
    });
    await persistDb();
    return NextResponse.json({
      ok: true,
      mode: "write",
      marker,
      businessId: created.id,
      name: created.name,
      database: usingTurso() ? "turso" : "local-file",
      durable: databaseIsDurable(),
    });
  }

  const existing = (await listBusinesses()).find((b) => b.owner_whatsapp === MARKER_PHONE);
  const name = existing?.name ?? null;
  const matched = expected ? name === expected : Boolean(name);
  return NextResponse.json({
    ok: matched,
    mode: "verify",
    expected: expected || null,
    found: name,
    businessId: existing?.id ?? null,
    database: usingTurso() ? "turso" : "local-file",
    durable: databaseIsDurable(),
    survived: matched,
  });
}
