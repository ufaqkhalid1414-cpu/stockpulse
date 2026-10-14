/**
 * Pure purchase-price math extracted from `recordPurchasePrice` in
 * `lib/db/queries.ts`. No Firestore, no I/O.
 */

/** Percent change from `previous` to `next`. Positive = price went up. */
export function purchasePriceChangePct(previous: number, next: number): number {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === 0) return 0;
  return ((next - previous) / previous) * 100;
}

/**
 * Mirrors the threshold check in `recordPurchasePrice` (queries.ts, ~line 502):
 * alert when the absolute percent change is at or above the business's
 * configured threshold. Boundary is inclusive (`>=`).
 */
export function shouldAlertOnPurchasePriceChange(
  previous: number,
  next: number,
  thresholdPct: number,
): boolean {
  if (!Number.isFinite(previous) || previous <= 0) return false;
  const pct = purchasePriceChangePct(previous, next);
  return Math.abs(pct) >= thresholdPct;
}
