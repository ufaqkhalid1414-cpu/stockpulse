import { createHash } from "crypto";
import type { Lang } from "@/lib/i18n";
import type {
  AccessRole,
  BusinessOwner,
  Location,
  OwnerAccess,
  Permission,
  PriceCompareUnit,
  PriceEntry,
  PricePoint,
  Product,
  ShopifyConnectionPublic,
  StaffMember,
  StockPlace,
  StockPlaceKind,
} from "@/lib/types";
import { ensureDbReady, firestoreDb, getBackupDir, newId, nowIso } from "@/lib/db";
import { listActivity } from "@/lib/db/activity";
import { phoneDocId } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { parseStaffPermission, roleFromPermission } from "@/lib/staff-permission";
import {
  applyAddPlace,
  applyAddWarehouse,
  applyRemovePlace,
  applyRemoveWarehouse,
  applyRenamePlace,
  applyRenameWarehouse,
  canRemovePlace,
  canRemoveWarehouse,
  DEFAULT_PLACES,
  normalizePlaces,
  placeDisplayName,
  placeHasNoStock,
} from "@/lib/places";
import {
  applyStockAdd,
  applyStockCorrection,
  applyStockDeduction,
  applyStockMove,
  displayTotalAcrossLocations,
  recountMapFrom,
  stockMapFrom,
  stockWritePayload,
  syncQtyMirrors,
  syncRecountMirrors,
  withRecountFlag,
  type LocationQtys,
  type RecountFlags,
} from "@/lib/stock-math";
import { isIdempotencyRecordExpired } from "@/lib/idempotency";
import { formatMoney } from "@/lib/format";
import { priceInUnit } from "@/lib/price-display";
import { purchasePriceChangePct, shouldAlertOnPurchasePriceChange } from "@/lib/price-math";
import { rearmRecountAlert } from "@/lib/alert-throttle";
import {
  DEFAULT_LOW_STOCK_NUMBER,
  buildLowStockAlertMessage,
  evaluateLowStockCrossing,
  markEverHeld,
  placeLinesForProduct,
  readAlertedByPlace,
  readEverHeldByPlace,
} from "@/lib/low-stock";
import fs from "fs";
import path from "path";
import type { DocumentData, Transaction } from "firebase-admin/firestore";

/** Default when Add Product leaves the threshold blank. */
export const DEFAULT_LOW_STOCK_THRESHOLD = DEFAULT_LOW_STOCK_NUMBER;

export function locationLabel(location: Location, places?: StockPlace[]) {
  return placeDisplayName(places, location);
}

function readEverHeldMap(data: DocumentData): Record<string, boolean> {
  return readEverHeldByPlace(data as Parameters<typeof readEverHeldByPlace>[0]);
}

function readLowStockAlertedMap(data: DocumentData): Record<string, boolean> {
  return readAlertedByPlace(data as Parameters<typeof readAlertedByPlace>[0]);
}

type LowStockEval = {
  shouldAlert: boolean;
  alertedByPlace: Record<string, boolean>;
  everHeldByPlace: Record<string, boolean>;
  lowPlaceId: Location;
  lowPlaceQty: number;
};

/** Apply crossing / re-arm for one place after a qty change. */
function applyPlaceLowStockEval(input: {
  data: DocumentData;
  placeId: Location;
  previousQty: number;
  newQty: number;
}): LowStockEval {
  const threshold = Number(input.data.restockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
  const alertedByPlace = readLowStockAlertedMap(input.data);
  const everHeldByPlace = markEverHeld(readEverHeldMap(input.data), input.placeId, input.newQty);
  // Also mark if we started from a non-zero qty (held before).
  if (input.previousQty !== 0) everHeldByPlace[input.placeId] = true;

  const crossing = evaluateLowStockCrossing({
    previousQty: input.previousQty,
    newQty: input.newQty,
    threshold,
    alreadyAlerted: Boolean(alertedByPlace[input.placeId]),
  });
  alertedByPlace[input.placeId] = crossing.nextAlerted;

  return {
    shouldAlert: crossing.fire,
    alertedByPlace,
    everHeldByPlace,
    lowPlaceId: input.placeId,
    lowPlaceQty: input.newQty,
  };
}

async function buildLowStockAlertRow(
  businessId: string,
  productId: string,
  productName: string,
  lowPlaceId: Location,
  lowPlaceQty: number,
): Promise<AlertRow> {
  const product = await getProduct(businessId, productId);
  const business = await getBusiness(businessId);
  const places = business?.places;
  const lines = product
    ? placeLinesForProduct(product, places)
    : [{ id: lowPlaceId, name: locationLabel(lowPlaceId, places), qty: Math.max(0, lowPlaceQty), low: true }];
  const { title, body } = buildLowStockAlertMessage({
    productName,
    lowPlaceId,
    lowPlaceQty,
    placeLines: lines,
    language: business?.language,
    places,
  });
  return createAlert(businessId, {
    productId,
    kind: "low_stock",
    title,
    body,
  });
}

function readLocationQtys(data: DocumentData): LocationQtys {
  const warehouseQty = Number(data.warehouseQty ?? data.warehouse_qty ?? 0);
  const shopQty = Number(data.shopQty ?? data.shop_qty ?? 0);
  const onlineQty = Number(data.onlineQty ?? data.online_qty ?? 0);
  return syncQtyMirrors(
    stockMapFrom({
      warehouseQty,
      shopQty,
      onlineQty,
      stockByPlace: (data.stockByPlace as Record<string, number> | undefined) ?? undefined,
    }),
  );
}

export type BusinessRow = {
  id: string;
  name: string;
  language: Lang;
  owner_whatsapp: string | null;
  price_threshold: number;
  connected_stores: number;
  last_backup: string | null;
  created_at: string;
  is_sample: number;
  /** IANA timezone for scheduled reports (default Asia/Karachi). */
  timezone: string;
  places: StockPlace[];
};

export type Membership = {
  businessId: string;
  role: AccessRole;
  name: string;
  phone: string;
  email?: string | null;
};

export type AlertRow = {
  id: string;
  business_id: string;
  product_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  seen: number;
};

export type BackupHistoryEntry = {
  id: string;
  stampedAt: string;
  status: "success" | "failed";
  storagePath: string | null;
  error: string | null;
};

export type ShopifyConnectionRow = {
  business_id: string;
  shop_domain: string;
  access_token: string;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_count: number;
};

export type ShopifySyncItem = {
  shopifyVariantId: string;
  name: string;
  category: string;
  variant: string;
  onlineQty: number;
  purchasePrice: number;
};

export type MonthlyPricePoint = {
  key: string;
  label: string;
  price: number;
  count: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bizRef(businessId: string) {
  return firestoreDb().collection("businesses").doc(businessId);
}

function mapBusiness(id: string, data: DocumentData): BusinessRow {
  return {
    id,
    name: String(data.name ?? ""),
    language: (data.language ?? "en") as Lang,
    owner_whatsapp: data.ownerWhatsapp ?? data.owner_whatsapp ?? null,
    price_threshold: Number(data.priceThreshold ?? data.price_threshold ?? 10),
    connected_stores: Number(data.connectedStores ?? data.connected_stores ?? 0),
    last_backup: data.lastBackup ?? data.last_backup ?? null,
    created_at: String(data.createdAt ?? data.created_at ?? nowIso()),
    is_sample: Number(data.isSample ?? data.is_sample ?? 0),
    timezone: String(data.timezone || data.timeZone || "Asia/Karachi"),
    places: normalizePlaces(data.places),
  };
}

function mapPiecesPerCarton(data: DocumentData): number | null {
  const raw = data.piecesPerCarton ?? data.pieces_per_carton;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return null;
  return Math.floor(n);
}

function readRecountFlags(data: DocumentData): RecountFlags {
  return syncRecountMirrors(
    recountMapFrom({
      needsRecountWarehouse: Boolean(data.needsRecountWarehouse),
      needsRecountShop: Boolean(data.needsRecountShop),
      needsRecountOnline: Boolean(data.needsRecountOnline),
      recountByPlace: (data.recountByPlace as Record<string, boolean> | undefined) ?? undefined,
    }),
  );
}

function mapPriceCompareUnit(data: DocumentData, piecesPerCarton: number | null): PriceCompareUnit {
  const raw = String(data.priceCompareUnit ?? data.price_compare_unit ?? "").toLowerCase();
  if (raw === "carton" && piecesPerCarton && piecesPerCarton >= 2) return "carton";
  if (raw === "piece") return "piece";
  // Default: carton if the product has a carton size (first entry was usually carton).
  return piecesPerCarton && piecesPerCarton >= 2 ? "carton" : "piece";
}

function foldEntriesToMonthPoints(entries: PriceEntry[]): PricePoint[] {
  const byMonth = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.recordedAt) continue;
    byMonth.set(monthKey(entry.recordedAt), entry.pricePerPiece);
  }
  return [...byMonth.entries()].map(([month, price]) => ({ month, price }));
}

function mapProductDoc(
  id: string,
  data: DocumentData,
  entries: PriceEntry[] = [],
  history?: PricePoint[],
): Product {
  const piecesPerCarton = mapPiecesPerCarton(data);
  const priceEntries = entries;
  const priceHistory = history ?? foldEntriesToMonthPoints(priceEntries);
  const flags = readRecountFlags(data);
  const qtys = readLocationQtys(data);
  return {
    id,
    name: String(data.name ?? ""),
    category: String(data.category ?? ""),
    variant: String(data.variant ?? ""),
    warehouseQty: qtys.warehouseQty,
    shopQty: qtys.shopQty,
    onlineQty: qtys.onlineQty,
    stockByPlace: qtys.stockByPlace,
    purchasePrice: Number(data.purchasePrice ?? data.purchase_price ?? 0),
    restockThreshold: Number(data.restockThreshold ?? data.restock_threshold ?? 1),
    piecesPerCarton,
    priceCompareUnit: mapPriceCompareUnit(data, piecesPerCarton),
    photo: data.photo ? String(data.photo) : undefined,
    shopifyVariantId: data.shopifyVariantId ?? data.shopify_variant_id ?? null,
    priceEntries,
    priceHistory,
    archived: Boolean(data.archived),
    needsRecountWarehouse: flags.needsRecountWarehouse,
    needsRecountShop: flags.needsRecountShop,
    needsRecountOnline: flags.needsRecountOnline,
    recountByPlace: flags.recountByPlace,
    everHeldByPlace: readEverHeldMap(data),
    lowStockAlertedByPlace: readLowStockAlertedMap(data),
  };
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][d.getMonth()];
}

async function setPhoneIndex(input: {
  phone: string;
  businessId: string;
  role: AccessRole;
  name: string;
  memberId: string;
  kind: "owner" | "staff";
}) {
  const phone = normalizePhone(input.phone);
  await firestoreDb()
    .collection("phoneIndex")
    .doc(phoneDocId(phone))
    .set({
      phone,
      businessId: input.businessId,
      role: input.role,
      name: input.name,
      memberId: input.memberId,
      kind: input.kind,
    });
}

async function clearPhoneIndex(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  await firestoreDb().collection("phoneIndex").doc(phoneDocId(normalized)).delete().catch(() => undefined);
}

function normalizeEmailKey(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function emailIndexDocId(email: string) {
  return createHash("sha256").update(normalizeEmailKey(email)).digest("hex");
}

async function setEmailIndex(input: {
  email: string;
  businessId: string;
  role: AccessRole;
  name: string;
  memberId: string;
  kind: "owner" | "staff";
}) {
  const email = normalizeEmailKey(input.email);
  if (!email) return;
  await firestoreDb()
    .collection("emailIndex")
    .doc(emailIndexDocId(email))
    .set({
      email,
      businessId: input.businessId,
      role: input.role,
      name: input.name,
      memberId: input.memberId,
      kind: input.kind,
    });
}

async function clearEmailIndex(email: string) {
  const normalized = normalizeEmailKey(email);
  if (!normalized) return;
  await firestoreDb().collection("emailIndex").doc(emailIndexDocId(normalized)).delete().catch(() => undefined);
}

export async function ensureOwnersTable() {
  await ensureDbReady();
}

export async function getBusiness(id: string): Promise<BusinessRow | null> {
  await ensureDbReady();
  const snap = await bizRef(id).get();
  if (!snap.exists) return null;
  return mapBusiness(snap.id, snap.data()!);
}

export async function listBusinesses(): Promise<BusinessRow[]> {
  await ensureDbReady();
  const snap = await firestoreDb().collection("businesses").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => mapBusiness(d.id, d.data()));
}

export async function createBusiness(input: {
  name: string;
  language?: Lang;
  ownerWhatsapp?: string;
  ownerEmail?: string;
  ownerName?: string;
  seedSample?: boolean;
}): Promise<BusinessRow> {
  await ensureDbReady();
  const id = newId();
  const created = nowIso();
  const ownerWhatsapp = input.ownerWhatsapp?.trim() || null;
  const ownerEmail = input.ownerEmail ? normalizeEmailKey(input.ownerEmail) : null;
  const ownerName = String(input.ownerName || "").trim() || "Owner";
  await bizRef(id).set({
    name: input.name.trim(),
    language: input.language ?? "en",
    ownerWhatsapp,
    priceThreshold: 10,
    connectedStores: input.seedSample ? 2 : 0,
    lastBackup: null,
    createdAt: created,
    isSample: input.seedSample ? 1 : 0,
    timezone: "Asia/Karachi",
    places: DEFAULT_PLACES.map((p) => ({ ...p })),
  });

  if (input.seedSample) await seedSampleProducts(id);
  if (ownerWhatsapp || ownerEmail) {
    const phone = ownerWhatsapp ? normalizePhone(ownerWhatsapp) : "";
    const ownerId = newId();
    await bizRef(id).collection("owners").doc(ownerId).set({
      name: ownerName,
      phone,
      email: ownerEmail,
      accessType: "equal",
      isPrimary: true,
      addedAt: created,
    });
    if (phone) {
      await setPhoneIndex({
        phone,
        businessId: id,
        role: "equal_owner",
        name: ownerName,
        memberId: ownerId,
        kind: "owner",
      });
    }
    if (ownerEmail) {
      await setEmailIndex({
        email: ownerEmail,
        businessId: id,
        role: "equal_owner",
        name: ownerName,
        memberId: ownerId,
        kind: "owner",
      });
      const { setAuthAccountBusiness } = await import("@/lib/auth-accounts");
      await setAuthAccountBusiness(ownerEmail, id).catch(() => undefined);
    }
  }
  return (await getBusiness(id))!;
}

export async function updateBusiness(
  id: string,
  patch: Partial<{
    name: string;
    language: Lang;
    ownerWhatsapp: string | null;
    priceThreshold: number;
    connectedStores: number;
    lastBackup: string | null;
  }>,
) {
  const current = await getBusiness(id);
  if (!current) throw new Error("Business not found");
  await bizRef(id).set(
    {
      name: patch.name ?? current.name,
      language: patch.language ?? current.language,
      ownerWhatsapp: patch.ownerWhatsapp === undefined ? current.owner_whatsapp : patch.ownerWhatsapp,
      priceThreshold: patch.priceThreshold ?? current.price_threshold,
      connectedStores: patch.connectedStores ?? current.connected_stores,
      lastBackup: patch.lastBackup === undefined ? current.last_backup : patch.lastBackup,
      createdAt: current.created_at,
      isSample: current.is_sample,
    },
    { merge: true },
  );
  return (await getBusiness(id))!;
}

export async function clearSampleInventory(businessId: string) {
  const business = await getBusiness(businessId);
  if (!business || !business.is_sample) return false;
  const cols = ["sales", "alerts", "priceHistory", "products", "staff"] as const;
  for (const col of cols) {
    const snap = await bizRef(businessId).collection(col).get();
    const batch = firestoreDb().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }
  await bizRef(businessId).set({ isSample: 0, connectedStores: 0 }, { merge: true });
  return true;
}

export async function deleteBusiness(id: string) {
  await ensureDbReady();
  const owners = await getOwners(id);
  const staff = await getStaff(id);
  for (const o of owners) await clearPhoneIndex(o.phone);
  for (const s of staff) await clearPhoneIndex(s.phone);

  const subcols = [
    "products",
    "owners",
    "staff",
    "sales",
    "priceHistory",
    "alerts",
    "backupHistory",
    "activity",
    "shopify",
  ];
  for (const col of subcols) {
    const snap = await bizRef(id).collection(col).get();
    const batch = firestoreDb().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }
  await bizRef(id).delete();
}

/** Equality-only queries — avoid orderBy so we don't need a composite Firestore index. */
async function listPriceHistoryDocs(businessId: string, productId: string) {
  const snap = await bizRef(businessId).collection("priceHistory").where("productId", "==", productId).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        price: Number(data.price ?? 0),
        recordedAt: String(data.recordedAt ?? ""),
      };
    })
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function getPriceHistory(productId: string, businessId: string): Promise<PricePoint[]> {
  await ensureDbReady();
  const rows = await listPriceHistoryDocs(businessId, productId);
  if (!rows.length) return [];
  const byMonth = new Map<string, number>();
  for (const data of rows) {
    byMonth.set(monthKey(String(data.recordedAt)), Number(data.price));
  }
  return [...byMonth.entries()].map(([month, price]) => ({ month, price }));
}

export async function getRecentPurchasePrices(productId: string, businessId: string, limit = 3): Promise<number[]> {
  await ensureDbReady();
  const rows = await listPriceHistoryDocs(businessId, productId);
  return rows.slice(-Math.max(1, limit)).map((d) => Number(d.price));
}

export async function getMonthlyPurchasePrices(
  productId: string,
  businessId: string,
  months = 6,
): Promise<MonthlyPricePoint[]> {
  await ensureDbReady();
  const rows = await listPriceHistoryDocs(businessId, productId);

  const buckets = new Map<string, { sum: number; count: number; year: number; month: number }>();
  for (const data of rows) {
    const d = new Date(String(data.recordedAt));
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const current = buckets.get(key) || { sum: 0, count: 0, year, month };
    current.sum += Number(data.price);
    current.count += 1;
    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-Math.max(1, months))
    .map(([key, value]) => ({
      key,
      label: MONTH_LABELS[value.month],
      price: value.sum / value.count,
      count: value.count,
    }));
}

type PriceHistoryBundle = {
  entries: PriceEntry[];
  months: PricePoint[];
};

/** Load every priceHistory row once → entry lists + month-folded compat charts. */
async function priceHistoryByProduct(businessId: string): Promise<Map<string, PriceHistoryBundle>> {
  const snap = await bizRef(businessId).collection("priceHistory").get();
  const rowsByProduct = new Map<
    string,
    { id: string; price: number; recordedAt: string; piecesPerCarton: number | null }[]
  >();
  for (const doc of snap.docs) {
    const data = doc.data();
    const productId = String(data.productId ?? data.product_id ?? "");
    if (!productId) continue;
    const list = rowsByProduct.get(productId) || [];
    const ppcRaw = data.piecesPerCarton ?? data.pieces_per_carton;
    const ppc =
      ppcRaw === undefined || ppcRaw === null || Number(ppcRaw) < 2 ? null : Math.floor(Number(ppcRaw));
    list.push({
      id: doc.id,
      price: Number(data.price ?? data.pricePerPiece ?? data.price_per_piece ?? 0),
      recordedAt: String(data.recordedAt ?? data.recorded_at ?? ""),
      piecesPerCarton: ppc,
    });
    rowsByProduct.set(productId, list);
  }

  const out = new Map<string, PriceHistoryBundle>();
  for (const [productId, rows] of rowsByProduct) {
    rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const entries: PriceEntry[] = rows.map((row) => ({
      id: row.id,
      recordedAt: row.recordedAt,
      pricePerPiece: row.price,
      piecesPerCarton: row.piecesPerCarton,
    }));
    out.set(productId, { entries, months: foldEntriesToMonthPoints(entries) });
  }
  return out;
}

/** Excludes archived products by default — pass `includeArchived: true` for admin/restore surfaces. */
export async function getProducts(
  businessId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Product[]> {
  await ensureDbReady();
  const [snap, historyMap] = await Promise.all([
    bizRef(businessId).collection("products").orderBy("createdAt", "desc").get(),
    priceHistoryByProduct(businessId),
  ]);
  const products = snap.docs.map((doc) => {
    const bundle = historyMap.get(doc.id) || { entries: [], months: [] };
    return mapProductDoc(doc.id, doc.data(), bundle.entries, bundle.months);
  });
  return opts.includeArchived ? products : products.filter((p) => !p.archived);
}

export async function getProduct(businessId: string, productId: string): Promise<Product | null> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("products").doc(productId).get();
  if (!snap.exists) return null;
  const bundleMap = await priceHistoryByProduct(businessId);
  const bundle = bundleMap.get(productId) || { entries: [], months: [] };
  return mapProductDoc(snap.id, snap.data()!, bundle.entries, bundle.months);
}

export type AddProductResult = {
  product: Product;
  audit: {
    location: Location;
    quantityAdded: number;
    previousLocationQty: number;
    newLocationQty: number;
    previousTotal: number;
    newTotal: number;
    purchasePrice: number;
    restockThreshold: number;
  };
};

export async function addProduct(
  businessId: string,
  input: {
    name: string;
    category: string;
    variant: string;
    location: Location;
    quantity: number;
    purchasePrice: number;
    photo?: string;
    restockThreshold?: number;
    piecesPerCarton?: number | null;
  },
): Promise<AddProductResult> {
  await clearSampleInventory(businessId);
  const id = newId();
  const created = nowIso();
  const stockByPlace: Record<string, number> = {
    warehouse: 0,
    shop: 0,
    online: 0,
    [input.location]: input.quantity,
  };
  const qtys = syncQtyMirrors(stockByPlace);
  const flags = syncRecountMirrors({ warehouse: false, shop: false, online: false });
  const threshold =
    input.restockThreshold !== undefined &&
    Number.isFinite(input.restockThreshold) &&
    input.restockThreshold >= 0
      ? Math.floor(input.restockThreshold)
      : DEFAULT_LOW_STOCK_THRESHOLD;
  const ppc =
    input.piecesPerCarton !== undefined &&
    input.piecesPerCarton !== null &&
    Number.isFinite(input.piecesPerCarton) &&
    Number(input.piecesPerCarton) >= 2
      ? Math.floor(Number(input.piecesPerCarton))
      : null;

  const priceCompareUnit: PriceCompareUnit = ppc && ppc >= 2 ? "carton" : "piece";
  const productDoc = {
    name: input.name.trim(),
    category: input.category.trim(),
    variant: input.variant.trim(),
    ...stockWritePayload(qtys, flags),
    purchasePrice: input.purchasePrice,
    restockThreshold: threshold,
    piecesPerCarton: ppc,
    priceCompareUnit,
    lowStockAlerted: false,
    lowStockAlertedByPlace: {} as Record<string, boolean>,
    everHeldByPlace: { [input.location]: true } as Record<string, boolean>,
    photo: input.photo ?? null,
    createdAt: created,
    shopifyVariantId: null,
    archived: false,
  };
  const historyId = newId();
  const batch = firestoreDb().batch();
  batch.set(bizRef(businessId).collection("products").doc(id), productDoc);
  batch.set(bizRef(businessId).collection("priceHistory").doc(historyId), {
    productId: id,
    price: input.purchasePrice,
    pricePerPiece: input.purchasePrice,
    piecesPerCarton: ppc,
    recordedAt: created,
  });
  await batch.commit();

  const firstEntry: PriceEntry = {
    id: historyId,
    recordedAt: created,
    pricePerPiece: input.purchasePrice,
    piecesPerCarton: ppc,
  };
  const product = mapProductDoc(id, productDoc, [firstEntry]);
  const stockMap = product.stockByPlace ?? {
    warehouse: product.warehouseQty,
    shop: product.shopQty,
    online: product.onlineQty,
  };
  const locationQty = Number(stockMap[input.location] ?? 0);
  return {
    product,
    audit: {
      location: input.location,
      quantityAdded: input.quantity,
      previousLocationQty: 0,
      newLocationQty: locationQty,
      previousTotal: 0,
      newTotal: Object.values(stockMap).reduce((s, n) => s + Number(n || 0), 0),
      purchasePrice: input.purchasePrice,
      restockThreshold: threshold,
    },
  };
}

export async function recordPurchasePrice(
  businessId: string,
  productId: string,
  price: number,
): Promise<{
  product: Product;
  alert: AlertRow | null;
  audit: { previousPrice: number; newPrice: number; productName: string; productId: string };
}> {
  const product = await getProduct(businessId, productId);
  if (!product) throw new Error("Product not found");
  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  const previousPrice = product.purchasePrice;
  const previous = await getRecentPurchasePrices(productId, businessId, 3);
  const recorded = nowIso();
  const ppc = product.piecesPerCarton;
  await bizRef(businessId).collection("priceHistory").doc(newId()).set({
    productId,
    price,
    pricePerPiece: price,
    piecesPerCarton: ppc,
    recordedAt: recorded,
  });
  await bizRef(businessId).collection("products").doc(productId).set({ purchasePrice: price }, { merge: true });

  let alert: AlertRow | null = null;
  if (previous.length > 0) {
    const baseline = previous[previous.length - 1];
    if (baseline > 0 && shouldAlertOnPurchasePriceChange(baseline, price, business.price_threshold)) {
      const pct = purchasePriceChangePct(baseline, price);
      const unit = product.priceCompareUnit;
      const comparePpc = unit === "carton" ? ppc : null;
      const displayed = priceInUnit(price, unit, comparePpc);
      const unitWord = unit === "carton" ? "carton" : "piece";
      const arrow = pct > 0 ? "📈" : "📉";
      const direction = pct > 0 ? "up" : "down";
      const title =
        pct > 0
          ? `${product.name} jumped ${Math.abs(pct).toFixed(1)}%`
          : `${product.name} dropped ${Math.abs(pct).toFixed(1)}%`;
      const body = `${arrow} ${product.name}: ${formatMoney(displayed)} per ${unitWord}, ${direction} ${Math.abs(pct).toFixed(1)}% from last entry.`;
      alert = await createAlert(businessId, { productId, kind: "price", title, body });
      logInfo("price_alert_triggered", {
        businessId,
        productId,
        pct: Number(pct.toFixed(2)),
        thresholdPct: business.price_threshold,
      });
    }
  }
  return {
    product: (await getProduct(businessId, productId))!,
    alert,
    audit: {
      previousPrice,
      newPrice: price,
      productName: product.name,
      productId: product.id,
    },
  };
}

function idemRef(businessId: string, key: string) {
  return bizRef(businessId).collection("idempotencyKeys").doc(key);
}

/**
 * Wraps a stock-mutating action in a single Firestore transaction that ALSO
 * enforces the 24h idempotency-key rule inside that same transaction: the
 * key doc is read, and (only on success) written, together with the stock
 * write — so a replayed key and the mutation it guards can never diverge or
 * half-apply. `fn` must do its own `txn.get`/`txn.set` of the product doc
 * (never a read-outside/write-outside-the-transaction call) and return a
 * small, JSON-serializable result that gets cached verbatim for replays.
 */
async function runStockTransaction<T>(
  businessId: string,
  idempotencyKey: string,
  action: string,
  fn: (txn: Transaction) => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new Error("idempotencyKey is required");
  }
  const ref = idemRef(businessId, idempotencyKey);
  return firestoreDb().runTransaction(async (txn) => {
    const existing = await txn.get(ref);
    if (existing.exists) {
      const data = existing.data()!;
      if (!isIdempotencyRecordExpired(String(data.createdAt ?? ""))) {
        return { result: data.result as T, replayed: true };
      }
    }
    const result = await fn(txn);
    txn.set(ref, { businessId, action, result, createdAt: nowIso() });
    return { result, replayed: false };
  });
}

export type RecordSaleAudit = {
  location: Location;
  quantity: number;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
  productName: string;
  productId: string;
  neededRecount: boolean;
};

export async function recordSale(
  businessId: string,
  input: { productId: string; location: Location; quantity: number; idempotencyKey: string },
): Promise<{ product: Product; alert: AlertRow | null; replayed: boolean; audit: RecordSaleAudit }> {
  const productRef = bizRef(businessId).collection("products").doc(input.productId);
  type TxResult = { audit: RecordSaleAudit; shouldAlert: boolean };

  type SaleTx = TxResult & {
    shouldAlert: boolean;
    suppressForRecount: boolean;
    lowPlaceId: Location;
    lowPlaceQty: number;
  };

  const { result, replayed } = await runStockTransaction<SaleTx>(
    businessId,
    input.idempotencyKey,
    "recordSale",
    async (txn) => {
      const snap = await txn.get(productRef);
      if (!snap.exists) throw new Error("Product not found");
      const data = snap.data()!;
      const productName = String(data.name ?? "");
      const flags = readRecountFlags(data);

      // Prompt 16 Part A: always record in full — quantity may go negative.
      const deduction = applyStockDeduction(readLocationQtys(data), input.location, input.quantity);
      const nextFlags = deduction.neededRecount
        ? withRecountFlag(flags, input.location, true)
        : flags;

      // Prompt 20: per-place crossing alert (never on add/create).
      const low = applyPlaceLowStockEval({
        data,
        placeId: input.location,
        previousQty: deduction.previousLocationQty,
        newQty: deduction.newLocationQty,
      });
      // If this sale also needs a recount, send only the recount alert.
      const shouldAlert = low.shouldAlert && !deduction.neededRecount;

      txn.set(
        productRef,
        {
          ...stockWritePayload(deduction.next, nextFlags),
          lowStockAlertedByPlace: low.alertedByPlace,
          everHeldByPlace: low.everHeldByPlace,
          lowStockAlerted: false,
        },
        { merge: true },
      );
      txn.set(bizRef(businessId).collection("sales").doc(newId()), {
        productId: input.productId,
        location: input.location,
        quantity: input.quantity,
        unitPrice: Number(data.purchasePrice ?? 0),
        neededRecount: deduction.neededRecount,
        recordedAt: nowIso(),
      });

      return {
        audit: {
          location: input.location,
          quantity: input.quantity,
          previousLocationQty: deduction.previousLocationQty,
          newLocationQty: deduction.newLocationQty,
          previousTotal: deduction.previousTotal,
          newTotal: deduction.newTotal,
          productName,
          productId: input.productId,
          neededRecount: deduction.neededRecount,
        },
        shouldAlert,
        suppressForRecount: low.shouldAlert && deduction.neededRecount,
        lowPlaceId: low.lowPlaceId,
        lowPlaceQty: low.lowPlaceQty,
      };
    },
  );

  logInfo("stock_deducted", {
    businessId,
    productId: input.productId,
    location: input.location,
    quantity: input.quantity,
    previousTotal: result.audit.previousTotal,
    newTotal: result.audit.newTotal,
    neededRecount: result.audit.neededRecount,
    replayed,
  });

  let alert: AlertRow | null = null;
  if (!replayed && result.shouldAlert) {
    alert = await buildLowStockAlertRow(
      businessId,
      input.productId,
      result.audit.productName,
      result.lowPlaceId,
      result.lowPlaceQty,
    );
    logInfo("low_stock_alert_triggered", {
      businessId,
      productId: input.productId,
      location: result.lowPlaceId,
      locationQty: Math.max(0, result.lowPlaceQty),
    });
  } else if (!replayed && result.suppressForRecount) {
    logInfo("low_stock_alert_suppressed_for_recount", {
      businessId,
      productId: input.productId,
      location: input.location,
    });
  }
  return { product: (await getProduct(businessId, input.productId))!, alert, replayed, audit: result.audit };
}

export type AddStockAudit = {
  location: Location;
  quantityAdded: number;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
  productName: string;
  productId: string;
};

export async function addStock(
  businessId: string,
  input: { productId: string; location: Location; quantity: number; idempotencyKey: string },
): Promise<{ product: Product; replayed: boolean; audit: AddStockAudit }> {
  const productRef = bizRef(businessId).collection("products").doc(input.productId);
  type TxResult = { audit: AddStockAudit };

  const { result, replayed } = await runStockTransaction<TxResult>(
    businessId,
    input.idempotencyKey,
    "addStock",
    async (txn) => {
      const snap = await txn.get(productRef);
      if (!snap.exists) throw new Error("Product not found");
      const data = snap.data()!;
      const productName = String(data.name ?? "");
      const addition = applyStockAdd(readLocationQtys(data), input.location, input.quantity);
      const flags = readRecountFlags(data);

      // Adding stock never alerts — it only re-arms when the place rises above the number.
      const low = applyPlaceLowStockEval({
        data,
        placeId: input.location,
        previousQty: addition.previousLocationQty,
        newQty: addition.newLocationQty,
      });

      txn.set(
        productRef,
        {
          ...stockWritePayload(addition.next, flags),
          lowStockAlertedByPlace: low.alertedByPlace,
          everHeldByPlace: low.everHeldByPlace,
          lowStockAlerted: false,
        },
        { merge: true },
      );

      return {
        audit: {
          location: input.location,
          quantityAdded: input.quantity,
          previousLocationQty: addition.previousLocationQty,
          newLocationQty: addition.newLocationQty,
          previousTotal: addition.previousTotal,
          newTotal: addition.newTotal,
          productName,
          productId: input.productId,
        },
      };
    },
  );

  logInfo("stock_added", { businessId, productId: input.productId, location: input.location, quantity: input.quantity, replayed });
  return { product: (await getProduct(businessId, input.productId))!, replayed, audit: result.audit };
}

export type MoveStockAudit = {
  from: Location;
  to: Location;
  quantity: number;
  previousFromQty: number;
  newFromQty: number;
  previousToQty: number;
  newToQty: number;
  productName: string;
  productId: string;
  neededRecount: boolean;
};

export async function moveStock(
  businessId: string,
  input: { productId: string; from: Location; to: Location; quantity: number; idempotencyKey: string },
): Promise<{ product: Product; replayed: boolean; alert: AlertRow | null; audit: MoveStockAudit }> {
  const productRef = bizRef(businessId).collection("products").doc(input.productId);
  type MoveTx = {
    audit: MoveStockAudit;
    shouldAlert: boolean;
    suppressForRecount: boolean;
    lowPlaceId: Location;
    lowPlaceQty: number;
  };

  const { result, replayed } = await runStockTransaction<MoveTx>(
    businessId,
    input.idempotencyKey,
    "moveStock",
    async (txn) => {
      const snap = await txn.get(productRef);
      if (!snap.exists) throw new Error("Product not found");
      const data = snap.data()!;
      const productName = String(data.name ?? "");
      const flags = readRecountFlags(data);

      // Prompt 16 Part A: always move in full; source may go negative.
      const move = applyStockMove(readLocationQtys(data), input.from, input.to, input.quantity);
      const nextFlags = move.neededRecount ? withRecountFlag(flags, input.from, true) : flags;

      // Prompt 20: source may cross into low; destination may re-arm when lifted above.
      const fromLow = applyPlaceLowStockEval({
        data,
        placeId: input.from,
        previousQty: move.previousFromQty,
        newQty: move.newFromQty,
      });
      const toLow = applyPlaceLowStockEval({
        data: {
          ...data,
          lowStockAlertedByPlace: fromLow.alertedByPlace,
          everHeldByPlace: fromLow.everHeldByPlace,
        },
        placeId: input.to,
        previousQty: move.previousToQty,
        newQty: move.newToQty,
      });
      const shouldAlert = fromLow.shouldAlert && !move.neededRecount;

      txn.set(
        productRef,
        {
          ...stockWritePayload(move.next, nextFlags),
          lowStockAlertedByPlace: toLow.alertedByPlace,
          everHeldByPlace: toLow.everHeldByPlace,
          lowStockAlerted: false,
        },
        { merge: true },
      );

      return {
        audit: {
          from: input.from,
          to: input.to,
          quantity: input.quantity,
          previousFromQty: move.previousFromQty,
          newFromQty: move.newFromQty,
          previousToQty: move.previousToQty,
          newToQty: move.newToQty,
          productName,
          productId: input.productId,
          neededRecount: move.neededRecount,
        },
        shouldAlert,
        suppressForRecount: fromLow.shouldAlert && move.neededRecount,
        lowPlaceId: fromLow.lowPlaceId,
        lowPlaceQty: fromLow.lowPlaceQty,
      };
    },
  );

  logInfo("stock_moved", {
    businessId,
    productId: input.productId,
    from: input.from,
    to: input.to,
    quantity: input.quantity,
    neededRecount: result.audit.neededRecount,
    replayed,
  });

  let alert: AlertRow | null = null;
  if (!replayed && result.shouldAlert) {
    alert = await buildLowStockAlertRow(
      businessId,
      input.productId,
      result.audit.productName,
      result.lowPlaceId,
      result.lowPlaceQty,
    );
    logInfo("low_stock_alert_triggered", {
      businessId,
      productId: input.productId,
      location: result.lowPlaceId,
      locationQty: Math.max(0, result.lowPlaceQty),
      via: "move",
    });
  }
  return { product: (await getProduct(businessId, input.productId))!, replayed, alert, audit: result.audit };
}

export type CorrectCountAudit = {
  location: Location;
  previousLocationQty: number;
  newLocationQty: number;
  previousTotal: number;
  newTotal: number;
  productName: string;
  productId: string;
};

export async function correctCount(
  businessId: string,
  input: { productId: string; location: Location; newCount: number; idempotencyKey: string },
): Promise<{ product: Product; replayed: boolean; alert: AlertRow | null; audit: CorrectCountAudit }> {
  const productRef = bizRef(businessId).collection("products").doc(input.productId);
  type TxResult = {
    audit: CorrectCountAudit;
    shouldAlert: boolean;
    lowPlaceId: Location;
    lowPlaceQty: number;
  };

  const { result, replayed } = await runStockTransaction<TxResult>(
    businessId,
    input.idempotencyKey,
    "correctCount",
    async (txn) => {
      const snap = await txn.get(productRef);
      if (!snap.exists) throw new Error("Product not found");
      const data = snap.data()!;
      const productName = String(data.name ?? "");
      const correction = applyStockCorrection(readLocationQtys(data), input.location, input.newCount);
      const flags = withRecountFlag(readRecountFlags(data), input.location, false);

      const low = applyPlaceLowStockEval({
        data,
        placeId: input.location,
        previousQty: correction.previousLocationQty,
        newQty: correction.newLocationQty,
      });

      txn.set(
        productRef,
        {
          ...stockWritePayload(correction.next, flags),
          lowStockAlertedByPlace: low.alertedByPlace,
          everHeldByPlace: low.everHeldByPlace,
          lowStockAlerted: false,
        },
        { merge: true },
      );

      return {
        audit: {
          location: input.location,
          previousLocationQty: correction.previousLocationQty,
          newLocationQty: correction.newLocationQty,
          previousTotal: correction.previousTotal,
          newTotal: correction.newTotal,
          productName,
          productId: input.productId,
        },
        shouldAlert: low.shouldAlert,
        lowPlaceId: low.lowPlaceId,
        lowPlaceQty: low.lowPlaceQty,
      };
    },
  );

  let alert: AlertRow | null = null;
  if (!replayed && result.shouldAlert) {
    alert = await buildLowStockAlertRow(
      businessId,
      input.productId,
      result.audit.productName,
      result.lowPlaceId,
      result.lowPlaceQty,
    );
  }

  if (!replayed) {
    await rearmRecountAlert(businessId, input.productId, input.location).catch(() => undefined);
  }

  logInfo("stock_corrected", { businessId, productId: input.productId, location: input.location, replayed });
  return { product: (await getProduct(businessId, input.productId))!, replayed, alert, audit: result.audit };
}

export type EditProductFields = {
  name: string;
  category: string;
  variant: string;
  restockThreshold: number;
  piecesPerCarton: number | null;
  photo: string | null;
};

export async function editProduct(
  businessId: string,
  input: {
    productId: string;
    name?: string;
    category?: string;
    variant?: string;
    photo?: string | null;
    restockThreshold?: number;
    piecesPerCarton?: number | null;
  },
): Promise<{ product: Product; before: EditProductFields; after: EditProductFields }> {
  const existing = await getProduct(businessId, input.productId);
  if (!existing) throw new Error("Product not found");

  const before: EditProductFields = {
    name: existing.name,
    category: existing.category,
    variant: existing.variant,
    restockThreshold: existing.restockThreshold,
    piecesPerCarton: existing.piecesPerCarton,
    photo: existing.photo ?? null,
  };

  // Metadata only — quantities are never touched here (add/sale/move/correct own those).
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category.trim();
  if (input.variant !== undefined) patch.variant = input.variant.trim();
  if (input.photo !== undefined) patch.photo = input.photo || null;
  if (input.restockThreshold !== undefined && Number.isFinite(input.restockThreshold) && input.restockThreshold >= 0) {
    patch.restockThreshold = Math.floor(input.restockThreshold);
  }
  if (input.piecesPerCarton !== undefined) {
    patch.piecesPerCarton =
      input.piecesPerCarton !== null && Number.isFinite(input.piecesPerCarton) && Number(input.piecesPerCarton) >= 2
        ? Math.floor(Number(input.piecesPerCarton))
        : null;
  }

  await bizRef(businessId).collection("products").doc(input.productId).set(patch, { merge: true });
  const product = (await getProduct(businessId, input.productId))!;
  const after: EditProductFields = {
    name: product.name,
    category: product.category,
    variant: product.variant,
    restockThreshold: product.restockThreshold,
    piecesPerCarton: product.piecesPerCarton,
    photo: product.photo ?? null,
  };
  return { product, before, after };
}

export async function setPriceCompareUnit(
  businessId: string,
  productId: string,
  unit: PriceCompareUnit,
): Promise<Product> {
  const existing = await getProduct(businessId, productId);
  if (!existing) throw new Error("Product not found");
  if (unit === "carton" && !existing.piecesPerCarton) {
    throw new Error("Save pieces per carton before comparing carton prices.");
  }
  if (unit !== "piece" && unit !== "carton") {
    throw new Error("Invalid compare unit");
  }
  await bizRef(businessId).collection("products").doc(productId).set({ priceCompareUnit: unit }, { merge: true });
  return (await getProduct(businessId, productId))!;
}

export async function archiveProduct(businessId: string, productId: string): Promise<Product> {
  const existing = await getProduct(businessId, productId);
  if (!existing) throw new Error("Product not found");
  await bizRef(businessId).collection("products").doc(productId).set({ archived: true }, { merge: true });
  return (await getProduct(businessId, productId))!;
}

export async function restoreProduct(businessId: string, productId: string): Promise<Product> {
  const existing = await getProduct(businessId, productId);
  if (!existing) throw new Error("Product not found");
  await bizRef(businessId).collection("products").doc(productId).set({ archived: false }, { merge: true });
  return (await getProduct(businessId, productId))!;
}

export async function getOwners(businessId: string): Promise<BusinessOwner[]> {
  await ensureDbReady();
  const { normalizeNotificationPrefs } = await import("@/lib/notification-prefs");
  const snap = await bizRef(businessId).collection("owners").get();
  const rows = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      email: data.email ? String(data.email) : null,
      accessType: String(data.accessType ?? data.access_type ?? "equal"),
      isPrimary: Boolean(data.isPrimary ?? data.is_primary),
      addedAt: String(data.addedAt ?? data.added_at ?? nowIso()),
      notificationPrefs: normalizeNotificationPrefs(data.notificationPrefs),
    };
  });
  rows.sort((a, b) => {
    const ap = a.isPrimary ? 1 : 0;
    const bp = b.isPrimary ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.addedAt.localeCompare(b.addedAt);
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    access: row.accessType === "co" ? "co" : "equal",
    isPrimary: row.isPrimary,
    addedAt: row.addedAt,
    notificationPrefs: row.notificationPrefs,
  }));
}

export async function updateOwnerNotificationPrefs(
  businessId: string,
  ownerId: string,
  prefs: Partial<BusinessOwner["notificationPrefs"]>,
): Promise<BusinessOwner> {
  const { normalizeNotificationPrefs } = await import("@/lib/notification-prefs");
  const owners = await getOwners(businessId);
  const owner = owners.find((o) => o.id === ownerId);
  if (!owner) throw new Error("Owner not found");
  const next = normalizeNotificationPrefs({ ...owner.notificationPrefs, ...prefs });
  await bizRef(businessId).collection("owners").doc(ownerId).set({ notificationPrefs: next }, { merge: true });
  return { ...owner, notificationPrefs: next };
}

/** Change an owner's own WhatsApp number (after OTP to the NEW number). Does not change primary account number. */
export async function updateOwnerOwnPhone(
  businessId: string,
  ownerId: string,
  newPhone: string,
): Promise<BusinessOwner> {
  const phone = normalizePhone(newPhone);
  if (!phone) throw new Error("WhatsApp number is required");
  const owners = await getOwners(businessId);
  const owner = owners.find((o) => o.id === ownerId);
  if (!owner) throw new Error("Owner not found");
  if (normalizePhone(owner.phone) === phone) return owner;

  const existing = await findMembershipByPhone(phone);
  if (existing && !(existing.businessId === businessId && existing.phone === phone)) {
    throw new Error("That WhatsApp number is already on an account");
  }

  const oldPhone = owner.phone;
  await bizRef(businessId).collection("owners").doc(ownerId).set({ phone }, { merge: true });
  await clearPhoneIndex(oldPhone);
  await setPhoneIndex({
    phone,
    businessId,
    role: owner.access === "co" ? "co_owner" : "equal_owner",
    name: owner.name,
    memberId: ownerId,
    kind: "owner",
  });
  return { ...owner, phone };
}

/** Find owner doc by WhatsApp phone within a business. */
export async function findOwnerByPhone(businessId: string, phone: string): Promise<BusinessOwner | null> {
  const normalized = normalizePhone(phone);
  const owners = await getOwners(businessId);
  return owners.find((o) => normalizePhone(o.phone) === normalized) ?? null;
}

export async function getOwnerPhones(businessId: string): Promise<string[]> {
  const phones = new Set<string>();
  for (const owner of await getOwners(businessId)) phones.add(normalizePhone(owner.phone));
  const business = await getBusiness(businessId);
  if (business?.owner_whatsapp) phones.add(normalizePhone(business.owner_whatsapp));
  return [...phones].filter(Boolean);
}

export async function addOwner(
  businessId: string,
  input: { name: string; phone: string; access: OwnerAccess },
): Promise<BusinessOwner> {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("WhatsApp number is required");

  const existingMember = await findMembershipByPhone(phone);
  if (existingMember) throw new Error("That WhatsApp number is already on an account");

  const id = newId();
  const addedAt = nowIso();
  const access = input.access === "co" ? "co" : "equal";
  await bizRef(businessId).collection("owners").doc(id).set({
    name,
    phone,
    accessType: access,
    isPrimary: false,
    addedAt,
  });
  await setPhoneIndex({
    phone,
    businessId,
    role: access === "co" ? "co_owner" : "equal_owner",
    name,
    memberId: id,
    kind: "owner",
  });
  return { id, name, phone, access, isPrimary: false, addedAt };
}

export async function removeOwner(businessId: string, ownerId: string) {
  const owners = await getOwners(businessId);
  const target = owners.find((o) => o.id === ownerId);
  if (!target) throw new Error("Owner not found");
  if (target.isPrimary) throw new Error("Cannot remove the primary owner");
  const equalLeft = owners.filter((o) => o.access === "equal" && o.id !== ownerId);
  if (target.access === "equal" && equalLeft.length === 0) {
    throw new Error("Keep at least one equal owner");
  }
  await bizRef(businessId).collection("owners").doc(ownerId).delete();
  await clearPhoneIndex(target.phone);
}

export async function findMembershipByPhone(phone: string): Promise<Membership | null> {
  await ensureDbReady();
  const normalized = normalizePhone(phone);
  const indexed = await firestoreDb().collection("phoneIndex").doc(phoneDocId(normalized)).get();
  if (indexed.exists) {
    const data = indexed.data()!;
    const businessId = String(data.businessId);
    const biz = await getBusiness(businessId);
    if (!biz) {
      // Stale index after migrate/delete — fall through to rescan
      logWarn("phone_index_stale", { businessId });
      await clearPhoneIndex(normalized);
    } else {
      return {
        businessId,
        role: data.role as AccessRole,
        name: String(data.name ?? ""),
        phone: String(data.phone ?? normalized),
      };
    }
  }

  // Fallback scan (legacy / pre-index)
  const businesses = await listBusinesses();
  for (const business of businesses) {
    const owners = await getOwners(business.id);
    const owner = owners.find((o) => normalizePhone(o.phone) === normalized);
    if (owner) {
      await setPhoneIndex({
        phone: normalized,
        businessId: business.id,
        role: owner.access === "co" ? "co_owner" : "equal_owner",
        name: owner.name,
        memberId: owner.id,
        kind: "owner",
      });
      return {
        businessId: business.id,
        role: owner.access === "co" ? "co_owner" : "equal_owner",
        name: owner.name,
        phone: normalized,
      };
    }
    const staff = await getStaff(business.id);
    const member = staff.find((s) => normalizePhone(s.phone) === normalized);
    if (member) {
      await setPhoneIndex({
        phone: normalized,
        businessId: business.id,
        role: roleFromPermission(member.permission),
        name: member.name,
        memberId: member.id,
        kind: "staff",
      });
      return {
        businessId: business.id,
        role: roleFromPermission(member.permission),
        name: member.name,
        phone: normalized,
      };
    }
    if (normalizePhone(business.owner_whatsapp || "") === normalized) {
      if (owners.length === 0) {
        const ownerId = newId();
        await bizRef(business.id).collection("owners").doc(ownerId).set({
          name: "Owner",
          phone: normalized,
          accessType: "equal",
          isPrimary: true,
          addedAt: nowIso(),
        });
        await setPhoneIndex({
          phone: normalized,
          businessId: business.id,
          role: "equal_owner",
          name: "Owner",
          memberId: ownerId,
          kind: "owner",
        });
      }
      return { businessId: business.id, role: "equal_owner", name: "Owner", phone: normalized };
    }
  }
  return null;
}

export async function findMembershipByEmail(email: string): Promise<Membership | null> {
  await ensureDbReady();
  const normalized = normalizeEmailKey(email);
  if (!normalized) return null;

  const indexed = await firestoreDb().collection("emailIndex").doc(emailIndexDocId(normalized)).get();
  if (indexed.exists) {
    const data = indexed.data()!;
    const businessId = String(data.businessId);
    const biz = await getBusiness(businessId);
    if (!biz) {
      logWarn("email_index_stale", { businessId });
      await clearEmailIndex(normalized);
    } else {
      return {
        businessId,
        role: data.role as AccessRole,
        name: String(data.name ?? ""),
        phone: String(data.phone ?? ""),
        email: normalized,
      };
    }
  }

  const { getAuthAccountByEmail } = await import("@/lib/auth-accounts");
  const account = await getAuthAccountByEmail(normalized);
  if (account?.businessId) {
    const biz = await getBusiness(account.businessId);
    if (biz) {
      await setEmailIndex({
        email: normalized,
        businessId: account.businessId,
        role: "equal_owner",
        name: account.name || "Owner",
        memberId: account.id,
        kind: "owner",
      });
      return {
        businessId: account.businessId,
        role: "equal_owner",
        name: account.name || "Owner",
        phone: "",
        email: normalized,
      };
    }
  }

  const businesses = await listBusinesses();
  for (const business of businesses) {
    const owners = await getOwners(business.id);
    const owner = owners.find((o) => normalizeEmailKey(o.email || "") === normalized);
    if (owner) {
      await setEmailIndex({
        email: normalized,
        businessId: business.id,
        role: owner.access === "co" ? "co_owner" : "equal_owner",
        name: owner.name,
        memberId: owner.id,
        kind: "owner",
      });
      return {
        businessId: business.id,
        role: owner.access === "co" ? "co_owner" : "equal_owner",
        name: owner.name,
        phone: owner.phone || "",
        email: normalized,
      };
    }
  }
  return null;
}

/** Resolve membership from a session that may have phone, email, or both. */
export async function findMembershipForSession(session: {
  phone?: string | null;
  email?: string | null;
}): Promise<Membership | null> {
  const phone = session.phone ? normalizePhone(session.phone) : "";
  if (phone) {
    const byPhone = await findMembershipByPhone(phone);
    if (byPhone) return byPhone;
  }
  if (session.email) {
    return findMembershipByEmail(session.email);
  }
  return null;
}

export async function getStaff(businessId: string): Promise<StaffMember[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("staff").orderBy("addedAt", "desc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      permission: parseStaffPermission(data.permission),
      addedAt: String(data.addedAt ?? nowIso()),
    };
  });
}

export async function addStaff(
  businessId: string,
  input: { name: string; phone: string; permission: Permission },
): Promise<StaffMember> {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  const permission = parseStaffPermission(input.permission);
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("WhatsApp number is required");

  const existingMember = await findMembershipByPhone(phone);
  if (existingMember) throw new Error("That WhatsApp number is already on an account");

  const id = newId();
  const addedAt = nowIso();
  await bizRef(businessId).collection("staff").doc(id).set({
    name,
    phone,
    permission,
    addedAt,
  });
  await setPhoneIndex({
    phone,
    businessId,
    role: roleFromPermission(permission),
    name,
    memberId: id,
    kind: "staff",
  });
  return { id, name, phone, permission, addedAt };
}

export async function removeStaff(businessId: string, staffId: string): Promise<StaffMember> {
  const staff = await getStaff(businessId);
  const target = staff.find((s) => s.id === staffId);
  if (!target) throw new Error("Staff member not found");
  await bizRef(businessId).collection("staff").doc(staffId).delete();
  await clearPhoneIndex(target.phone);
  return target;
}

export async function updateStaffPermission(
  businessId: string,
  staffId: string,
  permission: Permission,
): Promise<StaffMember> {
  const next = parseStaffPermission(permission);
  const staff = await getStaff(businessId);
  const target = staff.find((s) => s.id === staffId);
  if (!target) throw new Error("Staff member not found");
  await bizRef(businessId).collection("staff").doc(staffId).set({ permission: next }, { merge: true });
  await setPhoneIndex({
    phone: target.phone,
    businessId,
    role: roleFromPermission(next),
    name: target.name,
    memberId: staffId,
    kind: "staff",
  });
  return { ...target, permission: next };
}

export async function createAlert(
  businessId: string,
  input: { productId?: string | null; kind: string; title: string; body: string },
): Promise<AlertRow> {
  const id = newId();
  const created = nowIso();
  const row: AlertRow = {
    id,
    business_id: businessId,
    product_id: input.productId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    created_at: created,
    seen: 0,
  };
  await bizRef(businessId).collection("alerts").doc(id).set({
    productId: row.product_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: created,
    seen: 0,
  });
  return row;
}

export async function getAlerts(businessId: string, limit = 20): Promise<AlertRow[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("alerts").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      business_id: businessId,
      product_id: data.productId ?? null,
      kind: String(data.kind ?? ""),
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      created_at: String(data.createdAt ?? ""),
      seen: Number(data.seen ?? 0),
    };
  });
}

export async function getTopSeller(businessId: string): Promise<{ name: string; value: number } | null> {
  await ensureDbReady();
  const sales = await bizRef(businessId).collection("sales").get();
  if (sales.empty) return null;
  const totals = new Map<string, number>();
  for (const doc of sales.docs) {
    const data = doc.data();
    const pid = String(data.productId);
    const value = Number(data.quantity) * Number(data.unitPrice ?? 0);
    totals.set(pid, (totals.get(pid) ?? 0) + value);
  }
  let bestId = "";
  let bestVal = 0;
  for (const [pid, value] of totals) {
    if (value > bestVal) {
      bestVal = value;
      bestId = pid;
    }
  }
  if (!bestId || !bestVal) return null;
  const product = await getProduct(businessId, bestId);
  if (!product) return null;
  return { name: product.name, value: bestVal };
}

export async function findProductByName(businessId: string, query: string): Promise<Product | null> {
  const products = await getProducts(businessId);
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    products.find((p) => p.name.toLowerCase() === q) ??
    products.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ??
    null
  );
}

export async function findBusinessByWhatsapp(phone: string): Promise<BusinessRow | null> {
  const membership = await findMembershipByPhone(phone);
  if (!membership) return null;
  return await getBusiness(membership.businessId);
}

export async function listBackupHistory(businessId: string, limit = 50): Promise<BackupHistoryEntry[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId)
    .collection("backupHistory")
    .orderBy("stampedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      stampedAt: String(data.stampedAt ?? ""),
      status: data.status === "failed" ? "failed" : "success",
      storagePath: data.storagePath ?? null,
      error: data.error ?? null,
    };
  });
}

async function recordBackupHistory(
  businessId: string,
  stampedAt: string,
  status: "success" | "failed",
  storagePath: string | null,
  error: string | null,
) {
  await bizRef(businessId).collection("backupHistory").doc(newId()).set({
    stampedAt,
    status,
    storagePath,
    error,
  });
}

export async function runBackup(businessId: string): Promise<{ path: string; at: string; status: "success" }> {
  await ensureDbReady();
  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  const at = nowIso();
  const stamp = at.replace(/[:.]/g, "-");
  let storagePath: string | null = null;

  try {
    const salesSnap = await bizRef(businessId).collection("sales").orderBy("recordedAt", "desc").get();
    const priceSnap = await bizRef(businessId).collection("priceHistory").orderBy("recordedAt", "desc").get();
    const snapshot = {
      backedUpAt: at,
      business,
      products: await getProducts(businessId),
      staff: await getStaff(businessId),
      owners: await getOwners(businessId),
      alerts: await getAlerts(businessId, 100),
      sales: salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      priceHistory: priceSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
    const payload = JSON.stringify(snapshot, null, 2);
    const objectKey = `stockpulse-backups/${businessId}/${stamp}.json`;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(objectKey, payload, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      storagePath = blob.url;
    } else {
      const file = path.join(getBackupDir(), `${businessId}-${stamp}.json`);
      fs.writeFileSync(file, payload, "utf8");
      storagePath = file;
    }

    await updateBusiness(businessId, { lastBackup: at });
    await recordBackupHistory(businessId, at, "success", storagePath, null);
    logInfo("backup_run", { businessId, status: "success", storagePath });
    return { path: storagePath!, at, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    await recordBackupHistory(businessId, at, "failed", storagePath, message);
    logError("backup_run", { businessId, status: "failed" }, err);
    throw new Error(message);
  }
}

export async function runDailyBackups() {
  const businesses = await listBusinesses();
  const results: {
    businessId: string;
    name: string;
    ok: boolean;
    at?: string;
    path?: string;
    error?: string;
  }[] = [];

  for (const business of businesses) {
    try {
      const result = await runBackup(business.id);
      results.push({
        businessId: business.id,
        name: business.name,
        ok: true,
        at: result.at,
        path: result.path,
      });
    } catch (err) {
      results.push({
        businessId: business.id,
        name: business.name,
        ok: false,
        error: err instanceof Error ? err.message : "Backup failed",
      });
    }
  }
  return results;
}

async function seedSampleProducts(businessId: string) {
  const samples = [
    { name: "Basmati Rice", category: "Staples", variant: "5 kg", warehouse: 48, shop: 16, online: 12, price: 2450, threshold: 20, history: [2280, 2300, 2320, 2360, 2380, 2450], photo: "/samples/rice.jpg" },
    { name: "Cooking Oil", category: "Staples", variant: "5 L", warehouse: 22, shop: 8, online: 6, price: 3180, threshold: 15, history: [2800, 2860, 2900, 2940, 2935, 3180], photo: "/samples/oil.jpg" },
    { name: "Wheat Flour", category: "Staples", variant: "10 kg", warehouse: 60, shop: 24, online: 0, price: 1280, threshold: 30, history: [1240, 1250, 1260, 1270, 1280, 1280] },
    { name: "Sugar", category: "Staples", variant: "1 kg", warehouse: 90, shop: 0, online: 18, price: 180, threshold: 40, history: [210, 205, 200, 198, 190, 180] },
    { name: "Masoor Lentils", category: "Pulses", variant: "1 kg", warehouse: 10, shop: 4, online: 0, price: 320, threshold: 20, history: [300, 305, 310, 318, 325, 320] },
    { name: "Tea Leaves", category: "Pantry", variant: "400 g", warehouse: 8, shop: 4, online: 2, price: 560, threshold: 15, history: [500, 510, 515, 520, 530, 560] },
    { name: "Milk Powder", category: "Dairy", variant: "900 g", warehouse: 6, shop: 3, online: 0, price: 1150, threshold: 12, history: [1080, 1090, 1100, 1110, 1120, 1150] },
    { name: "Eggs", category: "Dairy", variant: "Dozen", warehouse: 0, shop: 18, online: 12, price: 380, threshold: 24, history: [340, 350, 360, 370, 375, 380] },
    { name: "Red Chilli Powder", category: "Spices", variant: "200 g", warehouse: 5, shop: 2, online: 0, price: 210, threshold: 12, history: [190, 195, 198, 200, 205, 210] },
    { name: "Iodised Salt", category: "Staples", variant: "800 g", warehouse: 40, shop: 22, online: 10, price: 70, threshold: 18, history: [68, 68, 70, 70, 70, 70] },
    { name: "Desi Ghee", category: "Staples", variant: "1 kg", warehouse: 14, shop: 6, online: 0, price: 1450, threshold: 10, history: [1320, 1340, 1360, 1380, 1400, 1450] },
    { name: "Laundry Soap", category: "Household", variant: "Bar", warehouse: 50, shop: 0, online: 15, price: 85, threshold: 24, history: [80, 80, 82, 84, 84, 85], piecesPerCarton: 100 },
  ] as const;

  for (const sample of samples) {
    const id = newId();
    const created = nowIso();
    const sampleQtys = syncQtyMirrors({
      warehouse: sample.warehouse,
      shop: sample.shop,
      online: sample.online,
    });
    const sampleFlags = syncRecountMirrors({ warehouse: false, shop: false, online: false });
    await bizRef(businessId).collection("products").doc(id).set({
      name: sample.name,
      category: sample.category,
      variant: sample.variant,
      ...stockWritePayload(sampleQtys, sampleFlags),
      purchasePrice: sample.price,
      restockThreshold: sample.threshold,
      piecesPerCarton: "piecesPerCarton" in sample ? sample.piecesPerCarton : null,
      photo: "photo" in sample ? sample.photo : null,
      createdAt: created,
      shopifyVariantId: null,
    });
    for (let index = 0; index < sample.history.length; index++) {
      const price = sample.history[index];
      const recorded = new Date();
      recorded.setMonth(recorded.getMonth() - (sample.history.length - 1 - index));
      recorded.setDate(12);
      await bizRef(businessId).collection("priceHistory").doc(newId()).set({
        productId: id,
        price,
        recordedAt: recorded.toISOString(),
      });
    }
  }

  const staffA = newId();
  const staffB = newId();
  await bizRef(businessId).collection("staff").doc(staffA).set({
    name: "Ahmed Khan",
    phone: normalizePhone("+92 300 555 0142"),
    permission: "add",
    addedAt: "2026-08-12T08:30:00.000Z",
  });
  await setPhoneIndex({
    phone: "+923005550142",
    businessId,
    role: "staff_add",
    name: "Ahmed Khan",
    memberId: staffA,
    kind: "staff",
  });
  await bizRef(businessId).collection("staff").doc(staffB).set({
    name: "Sara Ali",
    phone: normalizePhone("+92 321 555 0198"),
    permission: "view",
    addedAt: "2026-09-03T08:30:00.000Z",
  });
  await setPhoneIndex({
    phone: "+923215550198",
    businessId,
    role: "staff_view",
    name: "Sara Ali",
    memberId: staffB,
    kind: "staff",
  });
}

export async function getShopifyConnection(businessId: string): Promise<ShopifyConnectionRow | null> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("shopify").doc("connection").get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    business_id: businessId,
    shop_domain: String(data.shopDomain ?? ""),
    access_token: String(data.accessToken ?? ""),
    connected_at: String(data.connectedAt ?? ""),
    last_sync_at: data.lastSyncAt ?? null,
    last_sync_error: data.lastSyncError ?? null,
    last_sync_count: Number(data.lastSyncCount ?? 0),
  };
}

export async function getShopifyConnectionPublic(businessId: string): Promise<ShopifyConnectionPublic> {
  const row = await getShopifyConnection(businessId);
  if (!row) {
    return {
      connected: false,
      shopDomain: null,
      connectedAt: null,
      lastSyncAt: null,
      lastSyncError: null,
      lastSyncCount: 0,
    };
  }
  return {
    connected: true,
    shopDomain: row.shop_domain,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    lastSyncCount: row.last_sync_count,
  };
}

export async function saveShopifyConnection(businessId: string, shopDomain: string, accessToken: string) {
  const connectedAt = nowIso();
  await bizRef(businessId).collection("shopify").doc("connection").set({
    shopDomain,
    accessToken,
    connectedAt,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncCount: 0,
  });
  await updateBusiness(businessId, { connectedStores: 1 });
  return await getShopifyConnectionPublic(businessId);
}

export async function clearShopifyConnection(businessId: string) {
  await bizRef(businessId).collection("shopify").doc("connection").delete().catch(() => undefined);
  await updateBusiness(businessId, { connectedStores: 0 });
}

export async function markShopifySyncResult(
  businessId: string,
  result: { ok: boolean; count: number; error?: string },
) {
  await bizRef(businessId)
    .collection("shopify")
    .doc("connection")
    .set(
      {
        lastSyncAt: nowIso(),
        lastSyncError: result.ok ? null : result.error || "Sync failed",
        lastSyncCount: result.count,
      },
      { merge: true },
    );
  if (result.ok) await updateBusiness(businessId, { connectedStores: 1 });
}

export async function applyShopifyProductSync(businessId: string, items: ShopifySyncItem[]) {
  await clearSampleInventory(businessId);
  const existing = await getProducts(businessId);
  let upserted = 0;

  for (const item of items) {
    const byVariant = existing.find((row) => String(row.shopifyVariantId || "") === item.shopifyVariantId);
    const byName = existing.find(
      (row) =>
        row.name.toLowerCase() === item.name.toLowerCase() &&
        (row.variant || "").toLowerCase() === item.variant.toLowerCase(),
    );
    const match = byVariant || byName;

    if (match) {
      const stockByPlace = {
        ...(match.stockByPlace || { warehouse: match.warehouseQty, shop: match.shopQty, online: match.onlineQty }),
        online: item.onlineQty,
      };
      const nextQtys = syncQtyMirrors(stockByPlace);
      const nextTotal = displayTotalAcrossLocations(nextQtys);
      const patch: Record<string, unknown> = {
        ...nextQtys,
        shopifyVariantId: item.shopifyVariantId,
        category: match.category || item.category,
      };
      if (nextTotal > match.restockThreshold) patch.lowStockAlerted = false;
      await bizRef(businessId).collection("products").doc(match.id).set(patch, { merge: true });
      match.shopifyVariantId = item.shopifyVariantId;
      match.onlineQty = item.onlineQty;
      match.stockByPlace = nextQtys.stockByPlace;
      upserted += 1;
      continue;
    }

    const id = newId();
    const created = nowIso();
    const threshold = Math.max(1, Math.round(item.onlineQty * 0.3) || 1);
    const newQtys = syncQtyMirrors({ warehouse: 0, shop: 0, online: item.onlineQty });
    const newFlags = syncRecountMirrors({ warehouse: false, shop: false, online: false });
    await bizRef(businessId).collection("products").doc(id).set({
      name: item.name,
      category: item.category,
      variant: item.variant,
      ...stockWritePayload(newQtys, newFlags),
      purchasePrice: item.purchasePrice,
      restockThreshold: threshold,
      piecesPerCarton: null,
      lowStockAlerted: false,
      photo: null,
      createdAt: created,
      shopifyVariantId: item.shopifyVariantId,
    });
    if (item.purchasePrice > 0) {
      await bizRef(businessId).collection("priceHistory").doc(newId()).set({
        productId: id,
        price: item.purchasePrice,
        recordedAt: created,
      });
    }
    existing.push({
      id,
      name: item.name,
      category: item.category,
      variant: item.variant,
      warehouseQty: 0,
      shopQty: 0,
      onlineQty: item.onlineQty,
      stockByPlace: newQtys.stockByPlace,
      purchasePrice: item.purchasePrice,
      restockThreshold: threshold,
      piecesPerCarton: null,
      priceCompareUnit: "piece",
      priceEntries: [],
      shopifyVariantId: item.shopifyVariantId,
      priceHistory: [],
    });
    upserted += 1;
  }
  return upserted;
}

export async function buildBusinessState(businessId: string) {
  const business = await getBusiness(businessId);
  if (!business) return null;
  const [allProducts, staff, owners, backupHistory, activityHistory, alerts, shopify] =
    await Promise.all([
      getProducts(businessId, { includeArchived: true }),
      getStaff(businessId),
      getOwners(businessId),
      listBackupHistory(businessId, 50),
      listActivity(businessId, 100),
      getAlerts(businessId, 10),
      getShopifyConnectionPublic(businessId),
    ]);
  return {
    id: business.id,
    onboarded: true,
    businessName: business.name,
    language: business.language,
    products: allProducts.filter((p) => !p.archived),
    places: business.places?.length ? business.places : DEFAULT_PLACES.map((p) => ({ ...p })),
    // Owner-only — stripped for staff by sanitizeBusinessState, same as owners/staff/backups.
    archivedProducts: allProducts.filter((p) => p.archived),
    staff,
    owners,
    lastBackup: business.last_backup,
    backupHistory,
    activityHistory,
    connectedStores: business.connected_stores,
    ownerWhatsapp: business.owner_whatsapp,
    priceThreshold: business.price_threshold,
    alerts,
    isSample: Boolean(business.is_sample),
    shopify,
  };
}

export async function getPlaces(businessId: string): Promise<StockPlace[]> {
  const business = await getBusiness(businessId);
  return business?.places?.length ? business.places : DEFAULT_PLACES.map((p) => ({ ...p }));
}

export async function addStockPlace(
  businessId: string,
  kind: StockPlaceKind,
  name: string,
): Promise<StockPlace[]> {
  const places = await getPlaces(businessId);
  const next = applyAddPlace(places, kind, name, newId());
  await bizRef(businessId).set({ places: next }, { merge: true });
  return next;
}

export async function renameStockPlace(
  businessId: string,
  placeId: string,
  name: string,
): Promise<StockPlace[]> {
  const places = await getPlaces(businessId);
  const next = applyRenamePlace(places, placeId, name);
  await bizRef(businessId).set({ places: next }, { merge: true });
  return next;
}

export async function removeStockPlace(businessId: string, placeId: string): Promise<StockPlace[]> {
  const places = await getPlaces(businessId);
  const check = canRemovePlace(places, placeId);
  if (!check.ok) throw new Error(check.reason);
  const products = await getProducts(businessId, { includeArchived: true });
  if (!placeHasNoStock(products, placeId)) {
    throw new Error("Move or clear stock at this place before removing it");
  }
  const next = applyRemovePlace(places, placeId);
  await bizRef(businessId).set({ places: next }, { merge: true });
  return next;
}

export async function addWarehousePlace(businessId: string, name: string): Promise<StockPlace[]> {
  return addStockPlace(businessId, "warehouse", name);
}

export async function renameWarehousePlace(
  businessId: string,
  placeId: string,
  name: string,
): Promise<StockPlace[]> {
  const places = await getPlaces(businessId);
  const next = applyRenameWarehouse(places, placeId, name);
  await bizRef(businessId).set({ places: next }, { merge: true });
  return next;
}

export async function removeWarehousePlace(businessId: string, placeId: string): Promise<StockPlace[]> {
  const places = await getPlaces(businessId);
  const check = canRemoveWarehouse(places, placeId);
  if (!check.ok) throw new Error(check.reason);
  return removeStockPlace(businessId, placeId);
}
