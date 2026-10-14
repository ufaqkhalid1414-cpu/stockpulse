import { normalizeProductText } from "@/lib/product-search";
import { piecePriceFromCarton } from "@/lib/units";
import type { Location, Product } from "@/lib/types";

export const IMPORT_MAX_ROWS = 2000;

export type ImportRowInput = {
  rowNumber: number;
  name: string;
  category: string;
  variant: string;
  location: string;
  quantity: string;
  price: string;
  price_unit: string;
  pieces_per_carton: string;
  low_stock_threshold: string;
};

export type ValidImportRow = {
  rowNumber: number;
  name: string;
  category: string;
  variant: string;
  location: Location;
  quantity: number;
  purchasePrice: number;
  piecesPerCarton: number | null;
  restockThreshold: number | undefined;
  existingProductId: string | null;
};

export type ImportPreview = {
  ready: ValidImportRow[];
  problems: { rowNumber: number; message: string }[];
  existing: ValidImportRow[];
};

export const IMPORT_TEMPLATE_HEADERS = [
  "name",
  "category",
  "variant",
  "location",
  "quantity",
  "price",
  "price_unit",
  "pieces_per_carton",
  "low_stock_threshold",
] as const;

export const IMPORT_COLUMN_HELP: Record<(typeof IMPORT_TEMPLATE_HEADERS)[number], string> = {
  name: "Product name (required).",
  category: "Group, e.g. Staples or Snacks (required).",
  variant: "Size or pack, e.g. 5 kg. Leave blank if none.",
  location: "Warehouse, Shop, or Online — where this stock sits.",
  quantity: "How many pieces (or cartons if price_unit is carton — we convert).",
  price: "Purchase price as a number.",
  price_unit: "piece or carton.",
  pieces_per_carton: "Required when price_unit is carton (e.g. 100).",
  low_stock_threshold: "Optional. Leave blank to use the default (5).",
};

export function buildImportTemplateCsv(): string {
  const help = IMPORT_TEMPLATE_HEADERS.map((h) => IMPORT_COLUMN_HELP[h]).join(" | ");
  const header = IMPORT_TEMPLATE_HEADERS.join(",");
  const example1 = [
    "Basmati Rice",
    "Staples",
    "5 kg",
    "Warehouse",
    "40",
    "2450",
    "piece",
    "",
    "20",
  ].join(",");
  const example2 = [
    "Plain Biscuits",
    "Snacks",
    "family pack",
    "Shop",
    "2",
    "10000",
    "carton",
    "100",
    "10",
  ].join(",");
  return [`# ${help}`, header, example1, example2].join("\n");
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function rowsFromCsvMatrix(matrix: string[][]): ImportRowInput[] {
  if (matrix.length === 0) return [];
  let start = 0;
  // Skip comment / help lines starting with #
  while (start < matrix.length && String(matrix[start][0] || "").trim().startsWith("#")) start++;
  const header = (matrix[start] || []).map((h) => normalizeHeader(h));
  const idx = Object.fromEntries(IMPORT_TEMPLATE_HEADERS.map((h) => [h, header.indexOf(h)])) as Record<
    (typeof IMPORT_TEMPLATE_HEADERS)[number],
    number
  >;
  const out: ImportRowInput[] = [];
  for (let i = start + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells || cells.every((c) => !String(c || "").trim())) continue;
    const get = (key: (typeof IMPORT_TEMPLATE_HEADERS)[number]) =>
      idx[key] >= 0 ? String(cells[idx[key]] ?? "").trim() : "";
    out.push({
      rowNumber: i + 1,
      name: get("name"),
      category: get("category"),
      variant: get("variant"),
      location: get("location"),
      quantity: get("quantity"),
      price: get("price"),
      price_unit: get("price_unit"),
      pieces_per_carton: get("pieces_per_carton"),
      low_stock_threshold: get("low_stock_threshold"),
    });
  }
  return out;
}

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseLocation(raw: string): Location | null {
  const n = normalizeProductText(raw);
  if (n === "warehouse" || n === "گودام") return "warehouse";
  if (n === "shop" || n === "store" || n === "دکان") return "shop";
  if (n === "online" || n === "آن لائن" || n === "آنلاین") return "online";
  return null;
}

export function previewImportRows(
  rows: ImportRowInput[],
  existingProducts: Product[],
): ImportPreview {
  const ready: ValidImportRow[] = [];
  const problems: { rowNumber: number; message: string }[] = [];
  const existing: ValidImportRow[] = [];

  if (rows.length > IMPORT_MAX_ROWS) {
    problems.push({
      rowNumber: 0,
      message: `This file has ${rows.length} rows. The limit is ${IMPORT_MAX_ROWS}.`,
    });
    return { ready, problems, existing };
  }

  for (const row of rows) {
    const issues: string[] = [];
    if (!row.name.trim()) issues.push("name is required");
    if (!row.category.trim()) issues.push("category is required");
    const location = parseLocation(row.location);
    if (!location) issues.push("location must be Warehouse, Shop, or Online");
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) issues.push("quantity must be a number");
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) issues.push("price must be a number above zero");
    const unit = normalizeProductText(row.price_unit || "piece");
    if (unit !== "piece" && unit !== "carton") issues.push("price_unit must be piece or carton");
    let piecesPerCarton: number | null = null;
    let purchasePrice = price;
    if (unit === "carton") {
      const ppc = Number(row.pieces_per_carton);
      if (!Number.isFinite(ppc) || ppc < 2) {
        issues.push("pieces_per_carton is required when price_unit is carton");
      } else {
        piecesPerCarton = Math.floor(ppc);
        purchasePrice = piecePriceFromCarton(price, piecesPerCarton);
      }
    } else if (row.pieces_per_carton.trim()) {
      const ppc = Number(row.pieces_per_carton);
      if (Number.isFinite(ppc) && ppc >= 2) piecesPerCarton = Math.floor(ppc);
    }

    let restockThreshold: number | undefined;
    if (row.low_stock_threshold.trim() !== "") {
      const th = Number(row.low_stock_threshold);
      if (!Number.isFinite(th) || th < 0) issues.push("low_stock_threshold must be zero or a positive number");
      else restockThreshold = Math.floor(th);
    }

    if (issues.length > 0 || !location || !Number.isFinite(quantity) || !Number.isFinite(purchasePrice)) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Row ${row.rowNumber}: ${issues.join("; ")}.`,
      });
      continue;
    }

    const match = existingProducts.find(
      (p) =>
        normalizeProductText(p.name) === normalizeProductText(row.name) &&
        normalizeProductText(p.variant) === normalizeProductText(row.variant),
    );

    const valid: ValidImportRow = {
      rowNumber: row.rowNumber,
      name: row.name.trim(),
      category: row.category.trim(),
      variant: row.variant.trim(),
      location,
      quantity,
      purchasePrice,
      piecesPerCarton,
      restockThreshold,
      existingProductId: match?.id ?? null,
    };

    if (match) existing.push(valid);
    else ready.push(valid);
  }

  return { ready, problems, existing };
}

/** Stable key for the whole import payload so re-uploads don't double-apply. */
export function importContentKey(rows: ValidImportRow[], existingMode: "skip" | "add"): string {
  const body = rows
    .map(
      (r) =>
        `${normalizeProductText(r.name)}|${normalizeProductText(r.variant)}|${r.location}|${r.quantity}|${r.purchasePrice}`,
    )
    .join(";");
  return `${existingMode}::${body}`;
}
