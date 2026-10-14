import { formatMoney, formatQty } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { placeDisplayName } from "@/lib/places";
import type { Location, Product, StockPlace } from "@/lib/types";

/** Saved carton size, or null when the product is piece-only. Requires ≥ 2 pieces. */
export function piecesPerCartonOf(product: Pick<Product, "piecesPerCarton"> | null | undefined): number | null {
  const n = Number(product?.piecesPerCarton);
  if (!Number.isFinite(n) || n < 2) return null;
  return Math.floor(n);
}

export function hasCartonRatio(product: Pick<Product, "piecesPerCarton"> | null | undefined): boolean {
  return piecesPerCartonOf(product) !== null;
}

/** Convert an entered amount into piece quantity (stock source of truth). */
export function toPieceQty(entered: number, unit: "piece" | "carton", piecesPerCarton: number | null): number {
  if (!Number.isFinite(entered) || entered <= 0) return 0;
  if (unit === "carton") {
    if (!piecesPerCarton || piecesPerCarton < 2) return 0;
    return entered * piecesPerCarton;
  }
  return entered;
}

/** Per-piece price from a carton price. */
export function piecePriceFromCarton(cartonPrice: number, piecesPerCarton: number): number {
  if (!Number.isFinite(cartonPrice) || cartonPrice <= 0 || piecesPerCarton < 2) return 0;
  return Math.round((cartonPrice / piecesPerCarton) * 10000) / 10000;
}

/** Carton price from stored per-piece price. */
export function cartonPriceFromPiece(piecePrice: number, piecesPerCarton: number): number {
  if (!Number.isFinite(piecePrice) || piecesPerCarton < 2) return 0;
  return Math.round(piecePrice * piecesPerCarton * 100) / 100;
}

export function formatPricePerPiece(price: number, lang: Lang) {
  return t(lang, "pricePerPieceLabeled", { price: formatMoney(price) });
}

export function formatPricePerCarton(piecePrice: number, piecesPerCarton: number, lang: Lang) {
  const carton = cartonPriceFromPiece(piecePrice, piecesPerCarton);
  return t(lang, "pricePerCartonLabeled", {
    price: formatMoney(carton),
    count: formatQty(piecesPerCarton),
  });
}

export function formatBothPrices(piecePrice: number, piecesPerCarton: number | null, lang: Lang) {
  const piece = formatPricePerPiece(piecePrice, lang);
  if (!piecesPerCarton) return piece;
  return `${piece} · ${formatPricePerCarton(piecePrice, piecesPerCarton, lang)}`;
}

export function locationLabel(lang: Lang, location: Location, places?: StockPlace[]) {
  if (places?.length) return placeDisplayName(places, location);
  if (location === "warehouse") return t(lang, "warehouse");
  if (location === "shop") return t(lang, "shop");
  if (location === "online") return t(lang, "online");
  return placeDisplayName(undefined, location);
}

export function formatDeductionConfirm(input: {
  lang: Lang;
  unit: "piece" | "carton";
  entered: number;
  pieces: number;
  location: Location;
  places?: StockPlace[];
}) {
  const place = locationLabel(input.lang, input.location, input.places);
  if (input.unit === "carton") {
    return t(input.lang, "deductCartonConfirm", {
      cartons: formatQty(input.entered),
      pieces: formatQty(input.pieces),
      location: place,
    });
  }
  return t(input.lang, "deductPieceConfirm", {
    pieces: formatQty(input.pieces),
    location: place,
  });
}
