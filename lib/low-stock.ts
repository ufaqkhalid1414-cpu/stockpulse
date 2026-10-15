/**
 * Prompt 20 — low stock checked per place (Warehouse / Shop / Online / extra places),
 * not as one total. Crossing alerts re-arm when the place rises above the number again.
 */
import { placeDisplayName, DEFAULT_PLACES } from "@/lib/places";
import { displayQty, qtyAtLocation, stockMapFrom } from "@/lib/stock-math";
import type { Lang } from "@/lib/i18n";
import type { Location, Product, StockPlace } from "@/lib/types";

export const DEFAULT_LOW_STOCK_NUMBER = 5;

export type PlaceQtyLine = {
  id: string;
  name: string;
  qty: number;
  low: boolean;
};

/** At or below the product's low-stock number (displayed qty, never negative). */
export function isPlaceLow(qty: number, threshold: number): boolean {
  const t = Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_LOW_STOCK_NUMBER;
  return displayQty(qty) <= t;
}

/** A place that has never held this product is hidden and never alerts. */
export function placeEverHeld(
  product: Partial<Product> & {
    everHeldByPlace?: Record<string, boolean>;
    stockByPlace?: Record<string, number>;
  },
  placeId: string,
): boolean {
  const map = product.everHeldByPlace;
  if (map && map[placeId]) return true;
  const raw = qtyAtLocation(product, placeId);
  return raw !== 0;
}

export function markEverHeld(
  existing: Record<string, boolean> | null | undefined,
  placeId: string,
  qtyAfter: number,
): Record<string, boolean> {
  const next = { ...(existing || {}) };
  if (qtyAfter !== 0 || next[placeId]) next[placeId] = true;
  return next;
}

/**
 * Crossing event: was above the number, now at or below.
 * Returns whether to fire, and the next "already alerted" flag for that place.
 */
export function evaluateLowStockCrossing(input: {
  previousQty: number;
  newQty: number;
  threshold: number;
  alreadyAlerted: boolean;
}): { fire: boolean; nextAlerted: boolean } {
  const prev = displayQty(input.previousQty);
  const next = displayQty(input.newQty);
  const threshold =
    Number.isFinite(input.threshold) && input.threshold >= 0
      ? input.threshold
      : DEFAULT_LOW_STOCK_NUMBER;

  if (next > threshold) {
    return { fire: false, nextAlerted: false };
  }
  const crossed = prev > threshold && next <= threshold;
  if (crossed && !input.alreadyAlerted) {
    return { fire: true, nextAlerted: true };
  }
  // Still at/below: keep silenced if already alerted; otherwise stay ready (no fire without crossing).
  return { fire: false, nextAlerted: input.alreadyAlerted };
}

export function readAlertedByPlace(data: {
  lowStockAlertedByPlace?: Record<string, boolean>;
  lowStockAlerted?: boolean;
}): Record<string, boolean> {
  if (data.lowStockAlertedByPlace && typeof data.lowStockAlertedByPlace === "object") {
    return { ...data.lowStockAlertedByPlace };
  }
  // Legacy single flag — do not treat as per-place silence (fresh per-place rules).
  return {};
}

export function readEverHeldByPlace(data: {
  everHeldByPlace?: Record<string, boolean>;
  stockByPlace?: Record<string, number>;
  warehouseQty?: number;
  shopQty?: number;
  onlineQty?: number;
}): Record<string, boolean> {
  if (data.everHeldByPlace && typeof data.everHeldByPlace === "object") {
    return { ...data.everHeldByPlace };
  }
  const map = stockMapFrom(data);
  const out: Record<string, boolean> = {};
  for (const [id, qty] of Object.entries(map)) {
    if (Number(qty) !== 0) out[id] = true;
  }
  return out;
}

/** Places that have ever held this product, with low marks. */
export function placeLinesForProduct(
  product: Product,
  places?: StockPlace[],
): PlaceQtyLine[] {
  const list = places?.length ? places : DEFAULT_PLACES;
  const threshold = product.restockThreshold ?? DEFAULT_LOW_STOCK_NUMBER;
  const lines: PlaceQtyLine[] = [];
  for (const place of list) {
    if (!placeEverHeld(product, place.id)) continue;
    const qty = displayQty(qtyAtLocation(product, place.id));
    lines.push({
      id: place.id,
      name: place.name,
      qty,
      low: isPlaceLow(qty, threshold),
    });
  }
  return lines;
}

export function productHasLowPlace(product: Product, places?: StockPlace[]): boolean {
  return placeLinesForProduct(product, places).some((line) => line.low);
}

export function lowStockProductsPerPlace(products: Product[], places?: StockPlace[]): Product[] {
  return products
    .filter((p) => productHasLowPlace(p, places))
    .sort((a, b) => {
      const aMin = Math.min(...placeLinesForProduct(a, places).filter((l) => l.low).map((l) => l.qty), Infinity);
      const bMin = Math.min(...placeLinesForProduct(b, places).filter((l) => l.low).map((l) => l.qty), Infinity);
      return aMin - bMin;
    });
}

/** One-line summary for the Low Stock screen, e.g. "Shop 4 ⚠️, Online 6 ⚠️, Warehouse 50". */
export function formatLowStockPlaceSummary(product: Product, places?: StockPlace[]): string {
  return placeLinesForProduct(product, places)
    .map((line) => `${line.name} ${line.qty}${line.low ? " ⚠️" : ""}`)
    .join(", ");
}

export function buildLowStockAlertMessage(input: {
  productName: string;
  lowPlaceId: Location;
  lowPlaceQty: number;
  placeLines: PlaceQtyLine[];
  language?: Lang | string;
  places?: StockPlace[];
}): { title: string; body: string } {
  const lang = input.language || "en";
  const lowName = placeDisplayName(input.places, input.lowPlaceId);
  const qty = displayQty(input.lowPlaceQty);
  const others = input.placeLines
    .filter((l) => l.id !== input.lowPlaceId)
    .map((l) => `${l.name} ${l.qty}`)
    .join(" · ");

  if (lang === "ur") {
    const title = `⚠️ ${input.productName} کم ہے — ${lowName}`;
    const body = others
      ? `${input.productName} ${lowName} میں کم ہے: ${qty} باقی۔ ${others}`
      : `${input.productName} ${lowName} میں کم ہے: ${qty} باقی۔`;
    return { title, body };
  }

  const title = `⚠️ ${input.productName} is low in ${lowName}`;
  const body = others
    ? `${input.productName} is low in ${lowName}: ${qty} left. ${others}`
    : `${input.productName} is low in ${lowName}: ${qty} left.`;
  return { title, body };
}
