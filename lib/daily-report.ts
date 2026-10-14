import { formatMoney } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { priceDelta, recountProducts, stockValue, totalQty } from "@/lib/metrics";
import type { Product } from "@/lib/types";

/**
 * Prompt 18 §3 — action first, ≤6 short lines, no tables.
 */
export function buildDailyReportMessage(input: {
  businessName: string;
  language: Lang;
  products: Product[];
}): string {
  const { language, products } = input;
  const ur = language === "ur";
  const low = products.filter((p) => totalQty(p) <= p.restockThreshold);
  const recount = recountProducts(products);
  const value = stockValue(products);

  let biggest: { name: string; pct: number } | null = null;
  for (const p of products) {
    const pct = priceDelta(p);
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) continue;
    if (!biggest || Math.abs(pct) > Math.abs(biggest.pct)) {
      biggest = { name: p.name, pct };
    }
  }

  // Line 1 — the one thing that needs attention
  let action: string;
  if (biggest && Math.abs(biggest.pct) >= 5) {
    action = ur
      ? `آج توجہ: ${biggest.name} کی قیمت ${biggest.pct > 0 ? "بڑھی" : "گری"} ${Math.abs(biggest.pct).toFixed(0)}%`
      : `Needs attention: ${biggest.name} price ${biggest.pct > 0 ? "up" : "down"} ${Math.abs(biggest.pct).toFixed(0)}%`;
  } else if (low.length > 0) {
    action = ur
      ? `آج توجہ: ${low[0].name} کم پڑ رہا ہے`
      : `Needs attention: ${low[0].name} is running low`;
  } else if (recount.length > 0) {
    action = ur
      ? `آج توجہ: ${recount.length} آئٹم کو دوبارہ گننا ہے`
      : recount.length === 1
        ? "Needs attention: 1 item needs a recount"
        : `Needs attention: ${recount.length} items need a recount`;
  } else {
    action = ur ? "آج سب ٹھیک لگ رہا ہے।" : "Everything looks fine today.";
  }

  // Action first, then at most a few short facts (≤6 lines total).
  const lines = [
    action,
    ur ? `کل اسٹاک قیمت: ${formatMoney(value)}` : `Total stock value: ${formatMoney(value)}`,
    ur
      ? `دوبارہ گننے والے: ${recount.length}`
      : `Items needing a recount: ${recount.length}`,
    biggest
      ? ur
        ? `بڑی قیمت تبدیلی: ${biggest.name} (${biggest.pct > 0 ? "+" : ""}${biggest.pct.toFixed(1)}%)`
        : `Biggest price change: ${biggest.name} (${biggest.pct > 0 ? "+" : ""}${biggest.pct.toFixed(1)}%)`
      : ur
        ? "کوئی بڑی قیمت تبدیلی نہیں"
        : "No big price change",
  ];

  return lines.slice(0, 6).join("\n");
}

export function dailyReportLineCount(message: string): number {
  return message.split("\n").filter((l) => l.trim()).length;
}
