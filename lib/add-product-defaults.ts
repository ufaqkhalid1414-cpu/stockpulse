/**
 * Prompt 21 — safe first-time defaults for Add Product / new stock entry location.
 * Does not change saved products; only picks a starting location in the UI.
 */
import { PLACE_SHOP } from "@/lib/places";
import type { Location, StockPlace } from "@/lib/types";

/** Prefer Shop for a new product / new stock entry. User can still change it. */
export function defaultNewStockLocation(places?: StockPlace[] | null): Location {
  const list = places?.length ? places : [];
  const shop =
    list.find((p) => p.id === PLACE_SHOP) ||
    list.find((p) => p.kind === "shop");
  if (shop) return shop.id;
  return PLACE_SHOP;
}

export const DEFAULT_NEW_PRICE_UNIT = "piece" as const;

export const LOCATION_HINT_KEYS = {
  warehouse: "locationWarehouseHint",
  shop: "locationShopHint",
  online: "locationOnlineHint",
} as const;

/** Exact Prompt 21 English meanings (also mirrored in i18n). */
export const LOCATION_HINTS_EN = {
  warehouse: "Stock kept in your storage room or main stock location.",
  shop: "Stock physically available in your shop.",
  online: "Stock allocated to your online store or online sales.",
} as const;
