import type { Lang } from "@/lib/i18n";
import type {
  AccessRole,
  BusinessOwner,
  Location,
  OwnerAccess,
  Permission,
  PricePoint,
  Product,
  ShopifyConnectionPublic,
  StaffMember,
} from "@/lib/types";
import { ensureDbReady, firestoreDb, getBackupDir, newId, nowIso } from "@/lib/db";
import { listActivity } from "@/lib/db/activity";
import { phoneDocId } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import fs from "fs";
import path from "path";
import type { DocumentData } from "firebase-admin/firestore";

/** Default when Add Product leaves the threshold blank. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function locationLabel(location: Location) {
  if (location === "warehouse") return "Warehouse";
  if (location === "shop") return "Shop";
  return "Online";
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
};

export type Membership = {
  businessId: string;
  role: AccessRole;
  name: string;
  phone: string;
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
  };
}

function mapPiecesPerCarton(data: DocumentData): number | null {
  const raw = data.piecesPerCarton ?? data.pieces_per_carton;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return null;
  return Math.floor(n);
}

function mapProductDoc(id: string, data: DocumentData, history: PricePoint[]): Product {
  return {
    id,
    name: String(data.name ?? ""),
    category: String(data.category ?? ""),
    variant: String(data.variant ?? ""),
    warehouseQty: Number(data.warehouseQty ?? data.warehouse_qty ?? 0),
    shopQty: Number(data.shopQty ?? data.shop_qty ?? 0),
    onlineQty: Number(data.onlineQty ?? data.online_qty ?? 0),
    purchasePrice: Number(data.purchasePrice ?? data.purchase_price ?? 0),
    restockThreshold: Number(data.restockThreshold ?? data.restock_threshold ?? 1),
    piecesPerCarton: mapPiecesPerCarton(data),
    photo: data.photo ? String(data.photo) : undefined,
    shopifyVariantId: data.shopifyVariantId ?? data.shopify_variant_id ?? null,
    priceHistory: history,
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
  await firestoreDb().collection("phoneIndex").doc(phoneDocId(normalizePhone(phone))).delete().catch(() => undefined);
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
  seedSample?: boolean;
}): Promise<BusinessRow> {
  await ensureDbReady();
  const id = newId();
  const created = nowIso();
  const ownerWhatsapp = input.ownerWhatsapp?.trim() || null;
  await bizRef(id).set({
    name: input.name.trim(),
    language: input.language ?? "en",
    ownerWhatsapp,
    priceThreshold: 10,
    connectedStores: input.seedSample ? 2 : 0,
    lastBackup: null,
    createdAt: created,
    isSample: input.seedSample ? 1 : 0,
  });

  if (input.seedSample) await seedSampleProducts(id);
  if (ownerWhatsapp) {
    const phone = normalizePhone(ownerWhatsapp);
    const ownerId = newId();
    await bizRef(id).collection("owners").doc(ownerId).set({
      name: "Owner",
      phone,
      accessType: "equal",
      isPrimary: true,
      addedAt: created,
    });
    await setPhoneIndex({
      phone,
      businessId: id,
      role: "equal_owner",
      name: "Owner",
      memberId: ownerId,
      kind: "owner",
    });
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

export async function getProducts(businessId: string): Promise<Product[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("products").orderBy("createdAt", "desc").get();
  const products: Product[] = [];
  for (const doc of snap.docs) {
    products.push(mapProductDoc(doc.id, doc.data(), await getPriceHistory(doc.id, businessId)));
  }
  return products;
}

export async function getProduct(businessId: string, productId: string): Promise<Product | null> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("products").doc(productId).get();
  if (!snap.exists) return null;
  return mapProductDoc(snap.id, snap.data()!, await getPriceHistory(productId, businessId));
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
  const warehouse = input.location === "warehouse" ? input.quantity : 0;
  const shop = input.location === "shop" ? input.quantity : 0;
  const online = input.location === "online" ? input.quantity : 0;
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

  await bizRef(businessId).collection("products").doc(id).set({
    name: input.name.trim(),
    category: input.category.trim(),
    variant: input.variant.trim(),
    warehouseQty: warehouse,
    shopQty: shop,
    onlineQty: online,
    purchasePrice: input.purchasePrice,
    restockThreshold: threshold,
    piecesPerCarton: ppc,
    lowStockAlerted: false,
    photo: input.photo ?? null,
    createdAt: created,
    shopifyVariantId: null,
  });
  await bizRef(businessId).collection("priceHistory").doc(newId()).set({
    productId: id,
    price: input.purchasePrice,
    recordedAt: created,
  });
  const product = (await getProduct(businessId, id))!;
  const locationQty =
    input.location === "warehouse"
      ? product.warehouseQty
      : input.location === "shop"
        ? product.shopQty
        : product.onlineQty;
  return {
    product,
    audit: {
      location: input.location,
      quantityAdded: input.quantity,
      previousLocationQty: 0,
      newLocationQty: locationQty,
      previousTotal: 0,
      newTotal: product.warehouseQty + product.shopQty + product.onlineQty,
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
  await bizRef(businessId).collection("priceHistory").doc(newId()).set({
    productId,
    price,
    recordedAt: recorded,
  });
  await bizRef(businessId).collection("products").doc(productId).set({ purchasePrice: price }, { merge: true });

  let alert: AlertRow | null = null;
  if (previous.length > 0) {
    const baseline = previous[previous.length - 1];
    if (baseline > 0) {
      const pct = ((price - baseline) / baseline) * 100;
      if (Math.abs(pct) >= business.price_threshold) {
        const title =
          pct > 0
            ? `${product.name} jumped ${Math.abs(pct).toFixed(1)}%`
            : `${product.name} dropped ${Math.abs(pct).toFixed(1)}%`;
        const body = `New purchase price ${price} vs last ${baseline} (threshold ±${business.price_threshold}%).`;
        alert = await createAlert(businessId, { productId, kind: "price", title, body });
      }
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

export async function recordSale(
  businessId: string,
  input: { productId: string; location: Location; quantity: number },
): Promise<{
  product: Product;
  alert: AlertRow | null;
  audit: {
    location: Location;
    quantity: number;
    previousLocationQty: number;
    newLocationQty: number;
    previousTotal: number;
    newTotal: number;
    productName: string;
    productId: string;
  };
}> {
  const product = await getProduct(businessId, input.productId);
  if (!product) throw new Error("Product not found");
  if (input.quantity <= 0) throw new Error("Quantity must be above zero");

  const productRef = bizRef(businessId).collection("products").doc(input.productId);
  const productSnap = await productRef.get();
  const lowStockAlerted = Boolean(productSnap.data()?.lowStockAlerted);

  const current =
    input.location === "warehouse"
      ? product.warehouseQty
      : input.location === "shop"
        ? product.shopQty
        : product.onlineQty;
  if (input.quantity > current) throw new Error("Not enough stock at that location");

  const previousTotal = product.warehouseQty + product.shopQty + product.onlineQty;
  const nextWarehouse = input.location === "warehouse" ? product.warehouseQty - input.quantity : product.warehouseQty;
  const nextShop = input.location === "shop" ? product.shopQty - input.quantity : product.shopQty;
  const nextOnline = input.location === "online" ? product.onlineQty - input.quantity : product.onlineQty;
  const afterTotal = nextWarehouse + nextShop + nextOnline;
  const locationQty =
    input.location === "warehouse" ? nextWarehouse : input.location === "shop" ? nextShop : nextOnline;

  // Trigger on total qty (same rule as Low Stock screen). Debounce with lowStockAlerted.
  let nextAlerted = lowStockAlerted;
  let shouldAlert = false;
  if (afterTotal > product.restockThreshold) {
    nextAlerted = false;
  } else if (afterTotal <= product.restockThreshold && !lowStockAlerted) {
    nextAlerted = true;
    shouldAlert = true;
  }

  const batch = firestoreDb().batch();
  batch.set(
    productRef,
    {
      warehouseQty: nextWarehouse,
      shopQty: nextShop,
      onlineQty: nextOnline,
      lowStockAlerted: nextAlerted,
    },
    { merge: true },
  );
  batch.set(bizRef(businessId).collection("sales").doc(newId()), {
    productId: input.productId,
    location: input.location,
    quantity: input.quantity,
    unitPrice: product.purchasePrice,
    recordedAt: nowIso(),
  });
  await batch.commit();

  let alert: AlertRow | null = null;
  if (shouldAlert) {
    const place = locationLabel(input.location);
    alert = await createAlert(businessId, {
      productId: input.productId,
      kind: "low_stock",
      title: `⚠️ ${product.name} running low`,
      body: `${locationQty} left in ${place}. Reorder soon.`,
    });
  }
  return {
    product: (await getProduct(businessId, input.productId))!,
    alert,
    audit: {
      location: input.location,
      quantity: input.quantity,
      previousLocationQty: current,
      newLocationQty: locationQty,
      previousTotal,
      newTotal: afterTotal,
      productName: product.name,
      productId: product.id,
    },
  };
}

export async function getOwners(businessId: string): Promise<BusinessOwner[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("owners").get();
  const rows = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      accessType: String(data.accessType ?? data.access_type ?? "equal"),
      isPrimary: Boolean(data.isPrimary ?? data.is_primary),
      addedAt: String(data.addedAt ?? data.added_at ?? nowIso()),
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
    access: row.accessType === "co" ? "co" : "equal",
    isPrimary: row.isPrimary,
    addedAt: row.addedAt,
  }));
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
        role: member.permission === "add" ? "staff_add" : "staff_view",
        name: member.name,
        memberId: member.id,
        kind: "staff",
      });
      return {
        businessId: business.id,
        role: member.permission === "add" ? "staff_add" : "staff_view",
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

export async function getStaff(businessId: string): Promise<StaffMember[]> {
  await ensureDbReady();
  const snap = await bizRef(businessId).collection("staff").orderBy("addedAt", "desc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      permission: (data.permission === "add" ? "add" : "view") as Permission,
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
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("WhatsApp number is required");

  const existingMember = await findMembershipByPhone(phone);
  if (existingMember) throw new Error("That WhatsApp number is already on an account");

  const id = newId();
  const addedAt = nowIso();
  await bizRef(businessId).collection("staff").doc(id).set({
    name,
    phone,
    permission: input.permission,
    addedAt,
  });
  await setPhoneIndex({
    phone,
    businessId,
    role: input.permission === "add" ? "staff_add" : "staff_view",
    name,
    memberId: id,
    kind: "staff",
  });
  return { id, name, phone, permission: input.permission, addedAt };
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
    return { path: storagePath!, at, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    await recordBackupHistory(businessId, at, "failed", storagePath, message);
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
    await bizRef(businessId).collection("products").doc(id).set({
      name: sample.name,
      category: sample.category,
      variant: sample.variant,
      warehouseQty: sample.warehouse,
      shopQty: sample.shop,
      onlineQty: sample.online,
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
      const nextTotal = match.warehouseQty + match.shopQty + item.onlineQty;
      const patch: Record<string, unknown> = {
        onlineQty: item.onlineQty,
        shopifyVariantId: item.shopifyVariantId,
        category: match.category || item.category,
      };
      if (nextTotal > match.restockThreshold) patch.lowStockAlerted = false;
      await bizRef(businessId).collection("products").doc(match.id).set(patch, { merge: true });
      match.shopifyVariantId = item.shopifyVariantId;
      match.onlineQty = item.onlineQty;
      upserted += 1;
      continue;
    }

    const id = newId();
    const created = nowIso();
    const threshold = Math.max(1, Math.round(item.onlineQty * 0.3) || 1);
    await bizRef(businessId).collection("products").doc(id).set({
      name: item.name,
      category: item.category,
      variant: item.variant,
      warehouseQty: 0,
      shopQty: 0,
      onlineQty: item.onlineQty,
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
      purchasePrice: item.purchasePrice,
      restockThreshold: threshold,
      piecesPerCarton: null,
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
  return {
    id: business.id,
    onboarded: true,
    businessName: business.name,
    language: business.language,
    products: await getProducts(businessId),
    staff: await getStaff(businessId),
    owners: await getOwners(businessId),
    lastBackup: business.last_backup,
    backupHistory: await listBackupHistory(businessId, 50),
    activityHistory: await listActivity(businessId, 100),
    connectedStores: business.connected_stores,
    ownerWhatsapp: business.owner_whatsapp,
    priceThreshold: business.price_threshold,
    alerts: await getAlerts(businessId, 10),
    isSample: Boolean(business.is_sample),
    shopify: await getShopifyConnectionPublic(businessId),
  };
}
