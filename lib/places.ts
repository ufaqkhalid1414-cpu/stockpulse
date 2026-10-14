import type { Product, StockPlace, StockPlaceKind } from "@/lib/types";
import { displayQty } from "@/lib/stock-math";

export const PLACE_WAREHOUSE = "warehouse";
export const PLACE_SHOP = "shop";
export const PLACE_ONLINE = "online";

export const DEFAULT_PLACES: StockPlace[] = [
  { id: PLACE_WAREHOUSE, name: "Warehouse", kind: "warehouse" },
  { id: PLACE_SHOP, name: "Shop", kind: "shop" },
  { id: PLACE_ONLINE, name: "Online", kind: "online" },
];

const KIND_LABEL: Record<StockPlaceKind, string> = {
  warehouse: "warehouse",
  shop: "shop",
  online: "online store",
};

export function normalizePlaces(raw: unknown): StockPlace[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PLACES.map((p) => ({ ...p }));
  const out: StockPlace[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    if (!id || seen.has(id)) continue;
    const kind = inferKind(id, row.kind);
    const name = String(row.name || "").trim() || defaultNameFor(id, kind);
    out.push({ id, name, kind });
    seen.add(id);
  }
  // Ensure at least one of each kind
  if (!out.some((p) => p.kind === "warehouse")) out.unshift({ ...DEFAULT_PLACES[0] });
  if (!out.some((p) => p.kind === "shop")) out.push({ ...DEFAULT_PLACES[1] });
  if (!out.some((p) => p.kind === "online")) out.push({ ...DEFAULT_PLACES[2] });

  const warehouses = out.filter((p) => p.kind === "warehouse");
  const shops = out.filter((p) => p.kind === "shop");
  const online = out.filter((p) => p.kind === "online");
  return [...warehouses, ...shops, ...online];
}

function inferKind(id: string, kindRaw: unknown): StockPlaceKind {
  const k = String(kindRaw || "").toLowerCase();
  if (k === "shop" || k === "online" || k === "warehouse") return k;
  if (id === PLACE_SHOP || id.startsWith("shop-") || id.startsWith("shop_")) return "shop";
  if (id === PLACE_ONLINE || id.startsWith("online-") || id.startsWith("online_")) return "online";
  return "warehouse";
}

function defaultNameFor(id: string, kind: StockPlaceKind): string {
  if (id === PLACE_WAREHOUSE) return "Warehouse";
  if (id === PLACE_SHOP) return "Shop";
  if (id === PLACE_ONLINE) return "Online";
  if (kind === "warehouse") return "Warehouse";
  if (kind === "shop") return "Shop";
  return "Online";
}

export function placeById(places: StockPlace[], id: string): StockPlace | undefined {
  return places.find((p) => p.id === id);
}

export function placeDisplayName(places: StockPlace[] | undefined, id: string): string {
  const found = places?.find((p) => p.id === id);
  if (found) return found.name;
  return defaultNameFor(id, inferKind(id, undefined));
}

export function placesOfKind(places: StockPlace[], kind: StockPlaceKind): StockPlace[] {
  return places.filter((p) => p.kind === kind);
}

export function warehousePlaces(places: StockPlace[]): StockPlace[] {
  return placesOfKind(places, "warehouse");
}

export function canRemovePlace(
  places: StockPlace[],
  placeId: string,
): { ok: true } | { ok: false; reason: string } {
  const place = placeById(places, placeId);
  if (!place) return { ok: false, reason: "Place not found" };
  const sameKind = placesOfKind(places, place.kind);
  if (sameKind.length <= 1) {
    return {
      ok: false,
      reason: `Keep at least one ${KIND_LABEL[place.kind]}`,
    };
  }
  return { ok: true };
}

/** @deprecated use canRemovePlace */
export function canRemoveWarehouse(places: StockPlace[], placeId: string) {
  const place = placeById(places, placeId);
  if (!place) return { ok: false as const, reason: "Warehouse not found" };
  if (place.kind !== "warehouse") return { ok: false as const, reason: "Only warehouses can be removed here" };
  return canRemovePlace(places, placeId);
}

/** True when every product has zero displayed stock at this place. */
export function placeHasNoStock(products: Product[], placeId: string): boolean {
  for (const p of products) {
    const raw =
      p.stockByPlace && placeId in p.stockByPlace
        ? Number(p.stockByPlace[placeId] ?? 0)
        : placeId === PLACE_WAREHOUSE
          ? p.warehouseQty
          : placeId === PLACE_SHOP
            ? p.shopQty
            : placeId === PLACE_ONLINE
              ? p.onlineQty
              : 0;
    if (displayQty(raw) > 0 || raw < 0) return false;
  }
  return true;
}

export function applyAddPlace(
  places: StockPlace[],
  kind: StockPlaceKind,
  name: string,
  newId: string,
): StockPlace[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`Add a ${KIND_LABEL[kind]} name`);
  return normalizePlaces([...places, { id: newId, name: trimmed, kind }]);
}

export function applyRenamePlace(places: StockPlace[], placeId: string, name: string): StockPlace[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Add a name");
  const place = placeById(places, placeId);
  if (!place) throw new Error("Place not found");
  return places.map((p) => (p.id === placeId ? { ...p, name: trimmed } : p));
}

export function applyRemovePlace(places: StockPlace[], placeId: string): StockPlace[] {
  const check = canRemovePlace(places, placeId);
  if (!check.ok) throw new Error(check.reason);
  return normalizePlaces(places.filter((p) => p.id !== placeId));
}

export function applyAddWarehouse(places: StockPlace[], name: string, newId: string): StockPlace[] {
  return applyAddPlace(places, "warehouse", name, newId);
}

export function applyRenameWarehouse(places: StockPlace[], placeId: string, name: string): StockPlace[] {
  const place = placeById(places, placeId);
  if (!place || place.kind !== "warehouse") throw new Error("Warehouse not found");
  return applyRenamePlace(places, placeId, name);
}

export function applyRemoveWarehouse(places: StockPlace[], placeId: string): StockPlace[] {
  const check = canRemoveWarehouse(places, placeId);
  if (!check.ok) throw new Error(check.reason);
  return applyRemovePlace(places, placeId);
}
