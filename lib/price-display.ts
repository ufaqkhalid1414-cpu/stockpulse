import { formatMoney } from "@/lib/format";
import { intlLocale, t, type Lang } from "@/lib/i18n";
import type { PriceCompareUnit, PriceEntry } from "@/lib/types";
import { cartonPriceFromPiece } from "@/lib/units";

/** Carton size to use when displaying an entry (entry snapshot wins). */
export function ppcForEntry(entry: PriceEntry, productPpc: number | null): number | null {
  const raw = entry.piecesPerCarton ?? productPpc;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return null;
  return Math.floor(n);
}

export function priceInUnit(
  pricePerPiece: number,
  unit: PriceCompareUnit,
  piecesPerCarton: number | null,
): number {
  if (unit === "carton" && piecesPerCarton && piecesPerCarton >= 2) {
    return cartonPriceFromPiece(pricePerPiece, piecesPerCarton);
  }
  return pricePerPiece;
}

export function formatPriceWithUnit(
  pricePerPiece: number,
  unit: PriceCompareUnit,
  piecesPerCarton: number | null,
  lang: Lang,
): string {
  const inUnit = priceInUnit(pricePerPiece, unit, piecesPerCarton);
  if (unit === "carton" && piecesPerCarton && piecesPerCarton >= 2) {
    return t(lang, "pricePerCartonLabeled", {
      price: formatMoney(inUnit),
      count: piecesPerCarton,
    });
  }
  return t(lang, "pricePerPieceLabeled", { price: formatMoney(inUnit) });
}

/** Percent change between two entries — always on stored per-piece prices (unit-agnostic). */
export function entryPctChange(prev: Pick<PriceEntry, "pricePerPiece">, next: Pick<PriceEntry, "pricePerPiece">): number {
  const previous = prev.pricePerPiece;
  const current = next.pricePerPiece;
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function formatEntryChartLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale[lang], {
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Last N entries in chronological order (oldest → newest). */
export function lastNEntries(entries: PriceEntry[], n = 6): PriceEntry[] {
  if (entries.length <= n) return [...entries];
  return entries.slice(-n);
}
