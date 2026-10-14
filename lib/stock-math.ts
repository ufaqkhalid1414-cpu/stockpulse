/**
 * Pure stock-math helpers. Prompt 16 Part A: sales/moves always record in full;
 * quantity may go negative internally; UI never shows a minus (see displayQty).
 * Places are dynamic place ids (warehouses + shop + online).
 */
import type { Location } from "@/lib/types";

export type LocationQtys = {
  stockByPlace: Record<string, number>;
  warehouseQty: number;
  shopQty: number;
  onlineQty: number;
};

export type RecountFlags = {
  recountByPlace: Record<string, boolean>;
  needsRecountWarehouse: boolean;
  needsRecountShop: boolean;
  needsRecountOnline: boolean;
};

/** Sync builtin mirrors from the map. */
export function syncQtyMirrors(map: Record<string, number>): LocationQtys {
  const stockByPlace = { ...map };
  return {
    stockByPlace,
    warehouseQty: Number(stockByPlace.warehouse ?? 0),
    shopQty: Number(stockByPlace.shop ?? 0),
    onlineQty: Number(stockByPlace.online ?? 0),
  };
}

export function syncRecountMirrors(map: Record<string, boolean>): RecountFlags {
  const recountByPlace = { ...map };
  return {
    recountByPlace,
    needsRecountWarehouse: Boolean(recountByPlace.warehouse),
    needsRecountShop: Boolean(recountByPlace.shop),
    needsRecountOnline: Boolean(recountByPlace.online),
  };
}

/** Build a stock map from legacy three fields and/or stockByPlace. */
export function stockMapFrom(
  product: Partial<LocationQtys> & {
    stockByPlace?: Record<string, number>;
    warehouseQty?: number;
    shopQty?: number;
    onlineQty?: number;
  },
): Record<string, number> {
  const base: Record<string, number> = {
    warehouse: Number(product.warehouseQty ?? 0),
    shop: Number(product.shopQty ?? 0),
    online: Number(product.onlineQty ?? 0),
  };
  if (product.stockByPlace && typeof product.stockByPlace === "object") {
    for (const [k, v] of Object.entries(product.stockByPlace)) {
      base[k] = Number(v ?? 0);
    }
  }
  return base;
}

export function recountMapFrom(
  product: Partial<RecountFlags> & {
    recountByPlace?: Record<string, boolean>;
    needsRecountWarehouse?: boolean;
    needsRecountShop?: boolean;
    needsRecountOnline?: boolean;
  },
): Record<string, boolean> {
  const base: Record<string, boolean> = {
    warehouse: Boolean(product.needsRecountWarehouse),
    shop: Boolean(product.needsRecountShop),
    online: Boolean(product.needsRecountOnline),
  };
  if (product.recountByPlace && typeof product.recountByPlace === "object") {
    for (const [k, v] of Object.entries(product.recountByPlace)) {
      base[k] = Boolean(v);
    }
  }
  return base;
}

/** Sum of all place quantities (raw internal math — may be negative). */
export function totalAcrossLocations(product: Partial<LocationQtys>): number {
  const map = stockMapFrom(product);
  return Object.values(map).reduce((sum, n) => sum + Number(n || 0), 0);
}

/** Never show a minus — clamp for screens, WhatsApp, and reports. */
export function displayQty(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

/** Displayed total = sum of displayed (non-negative) location numbers. */
export function displayTotalAcrossLocations(product: Partial<LocationQtys>): number {
  const map = stockMapFrom(product);
  return Object.values(map).reduce((sum, n) => sum + displayQty(Number(n || 0)), 0);
}

export function qtyAtLocation(product: Partial<LocationQtys>, location: Location): number {
  const map = stockMapFrom(product);
  return Number(map[location] ?? 0);
}

export function recountFlagAt(flags: Partial<RecountFlags>, location: Location): boolean {
  const map = recountMapFrom(flags);
  return Boolean(map[location]);
}

export function withRecountFlag(flags: Partial<RecountFlags>, location: Location, value: boolean): RecountFlags {
  const map = recountMapFrom(flags);
  map[location] = value;
  return syncRecountMirrors(map);
}

/** Location needs a recount if flagged, or if raw qty went negative. */
export function locationNeedsRecount(
  product: Partial<LocationQtys> & Partial<RecountFlags>,
  location: Location,
): boolean {
  const raw = qtyAtLocation(product, location);
  if (raw < 0) return true;
  return recountFlagAt(product, location);
}

export function productNeedsRecount(product: Partial<LocationQtys> & Partial<RecountFlags>): boolean {
  const stock = stockMapFrom(product);
  const recount = recountMapFrom(product);
  const ids = new Set([...Object.keys(stock), ...Object.keys(recount)]);
  for (const id of ids) {
    if (locationNeedsRecount(product, id)) return true;
  }
  return false;
}

export function countProductsNeedingRecount(
  products: Array<Partial<LocationQtys> & Partial<RecountFlags>>,
): number {
  return products.filter(productNeedsRecount).length;
}

/**
 * Kept for callers that still expect the type name; Prompt 16 Part A no longer
 * blocks sales/moves — prefer neededRecount on the result instead.
 */
export class InsufficientStockError extends Error {
  readonly code = "INSUFFICIENT_STOCK" as const;
  location: Location;
  available: number;
  productId?: string;
  productName?: string;

  constructor(location: Location, available: number) {
    super("Not enough stock at that location");
    this.name = "InsufficientStockError";
    this.location = location;
    this.available = available;
  }
}

export type StockDeductionResult = {
  next: LocationQtys;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
  /** True when the amount recorded exceeded what the app held at that location. */
  neededRecount: boolean;
};

/**
 * Deduct `quantity` from exactly one location. Always records in full —
 * quantity may go negative. Sets neededRecount when the app held less than
 * the amount sold.
 */
export function applyStockDeduction(
  product: Partial<LocationQtys>,
  location: Location,
  quantity: number,
): StockDeductionResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be above zero");
  }

  const map = stockMapFrom(product);
  const previousLocationQty = Number(map[location] ?? 0);
  const previousTotal = totalAcrossLocations(syncQtyMirrors(map));
  const newLocationQty = previousLocationQty - quantity;
  const neededRecount = quantity > previousLocationQty || newLocationQty < 0;
  map[location] = newLocationQty;
  const next = syncQtyMirrors(map);

  return {
    next,
    previousLocationQty,
    newLocationQty,
    previousTotal,
    newTotal: totalAcrossLocations(next),
    neededRecount,
  };
}

export type StockAddResult = {
  next: LocationQtys;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
};

export function applyStockAdd(
  product: Partial<LocationQtys>,
  location: Location,
  quantity: number,
): StockAddResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be above zero");
  }

  const map = stockMapFrom(product);
  const previousLocationQty = Number(map[location] ?? 0);
  const previousTotal = totalAcrossLocations(syncQtyMirrors(map));
  const newLocationQty = previousLocationQty + quantity;
  map[location] = newLocationQty;
  const next = syncQtyMirrors(map);

  return {
    next,
    previousLocationQty,
    newLocationQty,
    previousTotal,
    newTotal: totalAcrossLocations(next),
  };
}

export type StockMoveResult = {
  next: LocationQtys;
  from: Location;
  to: Location;
  previousFromQty: number;
  newFromQty: number;
  previousToQty: number;
  newToQty: number;
  total: number;
  /** Source went below what the app held — flag "Needs recount" on `from`. */
  neededRecount: boolean;
};

/**
 * Move `quantity` from → to in full. Source may go negative; destination
 * always receives the full amount. Grand total still moves 1:1 (raw math).
 */
export function applyStockMove(
  product: Partial<LocationQtys>,
  from: Location,
  to: Location,
  quantity: number,
): StockMoveResult {
  if (from === to) {
    throw new Error("Pick two different locations to move stock between");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be above zero");
  }

  const map = stockMapFrom(product);
  const previousFromQty = Number(map[from] ?? 0);
  const previousToQty = Number(map[to] ?? 0);
  const newFromQty = previousFromQty - quantity;
  const newToQty = previousToQty + quantity;
  const neededRecount = quantity > previousFromQty || newFromQty < 0;
  map[from] = newFromQty;
  map[to] = newToQty;
  const next = syncQtyMirrors(map);

  return {
    next,
    from,
    to,
    previousFromQty,
    newFromQty,
    previousToQty,
    newToQty,
    total: totalAcrossLocations(next),
    neededRecount,
  };
}

export type StockCorrectionResult = {
  next: LocationQtys;
  location: Location;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
};

/**
 * Absolute recount at one location. Never sets a negative number.
 * Callers clear the Needs-recount flag for that location after this succeeds.
 */
export function applyStockCorrection(
  product: Partial<LocationQtys>,
  location: Location,
  newCount: number,
): StockCorrectionResult {
  if (!Number.isFinite(newCount) || newCount < 0) {
    throw new Error("Enter a count of zero or more");
  }

  const map = stockMapFrom(product);
  const previousLocationQty = Number(map[location] ?? 0);
  const previousTotal = totalAcrossLocations(syncQtyMirrors(map));
  const newLocationQty = Math.floor(newCount);
  map[location] = newLocationQty;
  const next = syncQtyMirrors(map);

  return {
    next,
    location,
    previousLocationQty,
    newLocationQty,
    previousTotal,
    newTotal: totalAcrossLocations(next),
  };
}

/** Firestore payload for a qty + recount write. */
export function stockWritePayload(next: LocationQtys, flags: RecountFlags) {
  return {
    stockByPlace: next.stockByPlace,
    warehouseQty: next.warehouseQty,
    shopQty: next.shopQty,
    onlineQty: next.onlineQty,
    recountByPlace: flags.recountByPlace,
    needsRecountWarehouse: flags.needsRecountWarehouse,
    needsRecountShop: flags.needsRecountShop,
    needsRecountOnline: flags.needsRecountOnline,
  };
}
