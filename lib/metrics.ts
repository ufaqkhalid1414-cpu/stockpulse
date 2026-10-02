import type { Product } from "@/lib/types";

export function totalQty(product: Product) {
  return product.warehouseQty + product.shopQty + (product.onlineQty ?? 0);
}

export function stockValue(products: Product[]) {
  return products.reduce((sum, product) => sum + totalQty(product) * product.purchasePrice, 0);
}

export function isLow(product: Product) {
  return totalQty(product) < product.restockThreshold;
}

export function priceDelta(product: Product) {
  const history = product.priceHistory;
  if (history.length < 2) return 0;
  const previous = history[history.length - 2].price;
  const current = history[history.length - 1].price;
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function currentPrice(product: Product) {
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

export function trendSeries(total: number) {
  return [0.88, 0.9, 0.92, 0.94, 0.97, 1].map((factor) => Math.round(total * factor));
}
