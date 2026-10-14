import { displayQty, displayTotalAcrossLocations, productNeedsRecount } from "@/lib/stock-math";
import type { Product } from "@/lib/types";

/** Displayed total pieces — never negative (Prompt 16 Part A). */
export function totalQty(product: Product) {
  return displayTotalAcrossLocations(product);
}

/** Stock value treats a negative location as 0. */
export function stockValue(products: Product[]) {
  return products.reduce((sum, product) => {
    const qty =
      displayQty(product.warehouseQty) + displayQty(product.shopQty) + displayQty(product.onlineQty ?? 0);
    return sum + qty * product.purchasePrice;
  }, 0);
}

export function isLow(product: Product) {
  return totalQty(product) <= product.restockThreshold;
}

export function priceDelta(product: Product) {
  const entries = product.priceEntries?.length
    ? product.priceEntries
    : product.priceHistory.map((p, i) => ({
        id: String(i),
        recordedAt: "",
        pricePerPiece: p.price,
        piecesPerCarton: product.piecesPerCarton,
      }));
  if (entries.length < 2) return 0;
  const previous = entries[entries.length - 2].pricePerPiece;
  const current = entries[entries.length - 1].pricePerPiece;
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function currentPrice(product: Product) {
  const entries = product.priceEntries;
  if (entries?.length) return entries[entries.length - 1].pricePerPiece;
  const history = product.priceHistory;
  if (history.length === 0) return product.purchasePrice;
  return history[history.length - 1].price;
}

export function changedProducts(products: Product[]) {
  return products.filter((product) => Math.abs(priceDelta(product)) >= 0.05);
}

export function biggestMoves(products: Product[], limit = 5) {
  return [...changedProducts(products)]
    .sort((a, b) => Math.abs(priceDelta(b)) - Math.abs(priceDelta(a)))
    .slice(0, limit);
}

export function lowStockProducts(products: Product[]) {
  return products
    .filter(isLow)
    .sort((a, b) => totalQty(a) / a.restockThreshold - totalQty(b) / b.restockThreshold);
}

export function recountProducts(products: Product[]) {
  return products.filter(productNeedsRecount);
}

export function trendSeries(total: number) {
  return [0.88, 0.9, 0.92, 0.94, 0.97, 1].map((factor) => Math.round(total * factor));
}
