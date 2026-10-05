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
import { ensureDbReady, getBackupDir, getDb, newId, nowIso, schedulePersistDb } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import fs from "fs";
import path from "path";

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

let ownersReady = false;

export async function ensureOwnersTable() {
  await ensureDbReady();
  if (ownersReady) return;
  await getDb().exec(`
    CREATE TABLE IF NOT EXISTS business_owners (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      access_type TEXT NOT NULL DEFAULT 'equal',
      is_primary INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_owners_business ON business_owners(business_id);
    CREATE INDEX IF NOT EXISTS idx_owners_phone ON business_owners(phone);
  `);

  // Migrate legacy primary owner_whatsapp into business_owners
  const businesses = await getDb().prepare("SELECT id, owner_whatsapp, created_at FROM businesses").all() as {
    id: string;
    owner_whatsapp: string | null;
    created_at: string;
  }[];
  for (const biz of businesses) {
    if (!biz.owner_whatsapp) continue;
    const phone = normalizePhone(biz.owner_whatsapp);
    const count = await getDb()
      .prepare("SELECT COUNT(*) as c FROM business_owners WHERE business_id = ?")
      .get(biz.id) as { c: number };
    if (Number(count.c) > 0) continue;
    await getDb()
      .prepare(
        `INSERT INTO business_owners (id, business_id, name, phone, access_type, is_primary, added_at)
         VALUES (?, ?, ?, ?, 'equal', 1, ?)`,
      )
      .run(newId(), biz.id, "Owner", phone, biz.created_at || nowIso());
  }
  ownersReady = true;
}

function mapProduct(row: Record<string, unknown>, history: PricePoint[]): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category ?? ""),
    variant: String(row.variant ?? ""),
    warehouseQty: Number(row.warehouse_qty ?? 0),
    shopQty: Number(row.shop_qty ?? 0),
    onlineQty: Number(row.online_qty ?? 0),
    purchasePrice: Number(row.purchase_price ?? 0),
    restockThreshold: Number(row.restock_threshold ?? 1),
    photo: row.photo ? String(row.photo) : undefined,
    shopifyVariantId: row.shopify_variant_id ? String(row.shopify_variant_id) : null,
    priceHistory: history,
  };
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][d.getMonth()];
}

export async function getBusiness(id: string): Promise<BusinessRow | null> {
  const row = await getDb().prepare("SELECT * FROM businesses WHERE id = ?").get(id) as BusinessRow | undefined;
  if (!row) return null;
  return { ...row, is_sample: Number(row.is_sample ?? 0) };
}

export async function listBusinesses(): Promise<BusinessRow[]> {
  return await getDb().prepare("SELECT * FROM businesses ORDER BY created_at DESC").all() as BusinessRow[];
}

export async function createBusiness(input: {
  name: string;
  language?: Lang;
  ownerWhatsapp?: string;
  seedSample?: boolean;
}): Promise<BusinessRow> {
  const id = newId();
  const created = nowIso();
  await getDb()
    .prepare(
      `INSERT INTO businesses (id, name, language, owner_whatsapp, price_threshold, connected_stores, last_backup, created_at, is_sample)
       VALUES (?, ?, ?, ?, 10, ?, NULL, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.language ?? "en",
      input.ownerWhatsapp?.trim() || null,
      input.seedSample ? 2 : 0,
      created,
      input.seedSample ? 1 : 0,
    );

  if (input.seedSample) await seedSampleProducts(id);
  if (input.ownerWhatsapp) {
    await ensureOwnersTable();
    const phone = normalizePhone(input.ownerWhatsapp);
    await getDb()
      .prepare(
        `INSERT INTO business_owners (id, business_id, name, phone, access_type, is_primary, added_at)
         VALUES (?, ?, ?, ?, 'equal', 1, ?)`,
      )
      .run(newId(), id, "Owner", phone, created);
  }
  schedulePersistDb();
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
  await getDb()
    .prepare(
      `UPDATE businesses SET name = ?, language = ?, owner_whatsapp = ?, price_threshold = ?, connected_stores = ?, last_backup = ?
       WHERE id = ?`,
    )
    .run(
      patch.name ?? current.name,
      patch.language ?? current.language,
      patch.ownerWhatsapp === undefined ? current.owner_whatsapp : patch.ownerWhatsapp,
      patch.priceThreshold ?? current.price_threshold,
      patch.connectedStores ?? current.connected_stores,
      patch.lastBackup === undefined ? current.last_backup : patch.lastBackup,
      id,
    );
  schedulePersistDb();
  return (await getBusiness(id))!;
}

/** Remove demo products/staff so real inventory never mixes with sample stock. */
export async function clearSampleInventory(businessId: string) {
  const business = await getBusiness(businessId);
  if (!business || !business.is_sample) return false;
  await getDb().prepare("DELETE FROM sales WHERE business_id = ?").run(businessId);
  await getDb().prepare("DELETE FROM alerts WHERE business_id = ?").run(businessId);
  await getDb().prepare("DELETE FROM price_history WHERE business_id = ?").run(businessId);
  await getDb().prepare("DELETE FROM products WHERE business_id = ?").run(businessId);
  await getDb().prepare("DELETE FROM staff WHERE business_id = ?").run(businessId);
  await getDb().prepare("UPDATE businesses SET is_sample = 0, connected_stores = 0 WHERE id = ?").run(businessId);
  schedulePersistDb();
  return true;
}

export async function deleteBusiness(id: string) {
  await getDb().prepare("DELETE FROM businesses WHERE id = ?").run(id);
  schedulePersistDb();
}

export async function getPriceHistory(productId: string, businessId: string): Promise<PricePoint[]> {
  const rows = await getDb()
    .prepare(
      `SELECT price, recorded_at FROM price_history
       WHERE product_id = ? AND business_id = ?
       ORDER BY recorded_at ASC`,
    )
    .all(productId, businessId) as { price: number; recorded_at: string }[];
  if (rows.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const row of rows) byMonth.set(monthKey(row.recorded_at), row.price);
  return [...byMonth.entries()].map(([month, price]) => ({ month, price }));
}

export async function getRecentPurchasePrices(productId: string, businessId: string, limit = 3): Promise<number[]> {
  const rows = await getDb()
    .prepare(
      `SELECT price FROM price_history
       WHERE product_id = ? AND business_id = ?
       ORDER BY recorded_at DESC LIMIT ?`,
    )
    .all(productId, businessId, limit) as { price: number }[];
  return rows.map((r) => r.price).reverse();
}

export type MonthlyPricePoint = {
  /** YYYY-MM */
  key: string;
  label: string;
  /** Average of purchases recorded in that calendar month */
  price: number;
  count: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Average purchase price per calendar month from actual price_history rows. */
export async function getMonthlyPurchasePrices(
  productId: string,
  businessId: string,
  months = 6,
): Promise<MonthlyPricePoint[]> {
  const rows = await getDb()
    .prepare(
      `SELECT price, recorded_at FROM price_history
       WHERE product_id = ? AND business_id = ?
       ORDER BY recorded_at ASC`,
    )
    .all(productId, businessId) as { price: number; recorded_at: string }[];

  const buckets = new Map<string, { sum: number; count: number; year: number; month: number }>();
  for (const row of rows) {
    const d = new Date(row.recorded_at);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const current = buckets.get(key) || { sum: 0, count: 0, year, month };
    current.sum += row.price;
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
  const rows = (await getDb()
    .prepare("SELECT * FROM products WHERE business_id = ? ORDER BY created_at DESC")
    .all(businessId)) as Record<string, unknown>[];
  const products: Product[] = [];
  for (const row of rows) {
    products.push(mapProduct(row, await getPriceHistory(String(row.id), businessId)));
  }
  return products;
}

export async function getProduct(businessId: string, productId: string): Promise<Product | null> {
  const row = await getDb()
    .prepare("SELECT * FROM products WHERE id = ? AND business_id = ?")
    .get(productId, businessId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapProduct(row, await getPriceHistory(productId, businessId));
}

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
  },
): Promise<Product> {
  await clearSampleInventory(businessId);

  const id = newId();
  const created = nowIso();
  const warehouse = input.location === "warehouse" ? input.quantity : 0;
  const shop = input.location === "shop" ? input.quantity : 0;
  const online = input.location === "online" ? input.quantity : 0;
  const threshold = Math.max(1, Math.round(input.quantity * 0.3));

  await getDb()
    .prepare(
      `INSERT INTO products
       (id, business_id, name, category, variant, warehouse_qty, shop_qty, online_qty, purchase_price, restock_threshold, photo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      businessId,
      input.name.trim(),
      input.category.trim(),
      input.variant.trim(),
      warehouse,
      shop,
      online,
      input.purchasePrice,
      threshold,
      input.photo ?? null,
      created,
    );

  await getDb()
    .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), id, businessId, input.purchasePrice, created);

  schedulePersistDb();
  return (await getProduct(businessId, id))!;
}

export async function recordPurchasePrice(
  businessId: string,
  productId: string,
  price: number,
): Promise<{ product: Product; alert: AlertRow | null }> {
  const product = await getProduct(businessId, productId);
  if (!product) throw new Error("Product not found");
  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  const previous = await getRecentPurchasePrices(productId, businessId, 3);
  const recorded = nowIso();
  await getDb()
    .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), productId, businessId, price, recorded);
  await getDb().prepare(`UPDATE products SET purchase_price = ? WHERE id = ? AND business_id = ?`).run(price, productId, businessId);

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

  schedulePersistDb();
  return { product: (await getProduct(businessId, productId))!, alert };
}

export async function recordSale(
  businessId: string,
  input: { productId: string; location: Location; quantity: number },
): Promise<Product> {
  const product = await getProduct(businessId, input.productId);
  if (!product) throw new Error("Product not found");
  if (input.quantity <= 0) throw new Error("Quantity must be above zero");

  const current =
    input.location === "warehouse"
      ? product.warehouseQty
      : input.location === "shop"
        ? product.shopQty
        : product.onlineQty;
  if (input.quantity > current) throw new Error("Not enough stock at that location");

  const nextWarehouse = input.location === "warehouse" ? product.warehouseQty - input.quantity : product.warehouseQty;
  const nextShop = input.location === "shop" ? product.shopQty - input.quantity : product.shopQty;
  const nextOnline = input.location === "online" ? product.onlineQty - input.quantity : product.onlineQty;

  await getDb()
    .prepare(`UPDATE products SET warehouse_qty = ?, shop_qty = ?, online_qty = ? WHERE id = ? AND business_id = ?`)
    .run(nextWarehouse, nextShop, nextOnline, input.productId, businessId);

  await getDb()
    .prepare(
      `INSERT INTO sales (id, business_id, product_id, location, quantity, unit_price, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), businessId, input.productId, input.location, input.quantity, product.purchasePrice, nowIso());

  schedulePersistDb();
  return (await getProduct(businessId, input.productId))!;
}

export async function getOwners(businessId: string): Promise<BusinessOwner[]> {
  await ensureOwnersTable();
  const rows = await getDb()
    .prepare("SELECT * FROM business_owners WHERE business_id = ? ORDER BY is_primary DESC, added_at ASC")
    .all(businessId) as {
    id: string;
    name: string;
    phone: string;
    access_type: string;
    is_primary: number;
    added_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    access: row.access_type === "co" ? "co" : "equal",
    isPrimary: Boolean(row.is_primary),
    addedAt: row.added_at,
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
  await ensureOwnersTable();
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("WhatsApp number is required");

  const existingMember = await findMembershipByPhone(phone);
  if (existingMember) throw new Error("That WhatsApp number is already on an account");

  const id = newId();
  const addedAt = nowIso();
  await getDb()
    .prepare(
      `INSERT INTO business_owners (id, business_id, name, phone, access_type, is_primary, added_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(id, businessId, name, phone, input.access === "co" ? "co" : "equal", addedAt);
  schedulePersistDb();
  return { id, name, phone, access: input.access === "co" ? "co" : "equal", isPrimary: false, addedAt };
}

export async function removeOwner(businessId: string, ownerId: string) {
  await ensureOwnersTable();
  const owners = await getOwners(businessId);
  const target = owners.find((o) => o.id === ownerId);
  if (!target) throw new Error("Owner not found");
  if (target.isPrimary) throw new Error("Cannot remove the primary owner");
  const equalLeft = owners.filter((o) => o.access === "equal" && o.id !== ownerId);
  if (target.access === "equal" && equalLeft.length === 0) {
    throw new Error("Keep at least one equal owner");
  }
  await getDb().prepare("DELETE FROM business_owners WHERE id = ? AND business_id = ?").run(ownerId, businessId);
  schedulePersistDb();
}

export async function findMembershipByPhone(phone: string): Promise<Membership | null> {
  await ensureOwnersTable();
  const normalized = normalizePhone(phone);

  const owner = await getDb()
    .prepare("SELECT * FROM business_owners WHERE phone = ? LIMIT 1")
    .get(normalized) as
    | { business_id: string; name: string; phone: string; access_type: string }
    | undefined;
  if (owner) {
    return {
      businessId: owner.business_id,
      role: owner.access_type === "co" ? "co_owner" : "equal_owner",
      name: owner.name,
      phone: owner.phone,
    };
  }

  const staffRows = await getDb().prepare("SELECT * FROM staff").all() as {
    business_id: string;
    name: string;
    phone: string;
    permission: Permission;
  }[];
  const staff = staffRows.find((s) => normalizePhone(s.phone) === normalized);
  if (staff) {
    return {
      businessId: staff.business_id,
      role: staff.permission === "add" ? "staff_add" : "staff_view",
      name: staff.name,
      phone: normalizePhone(staff.phone),
    };
  }

  // Legacy primary owner field
  const businesses = await listBusinesses();
  const business = businesses.find((b) => normalizePhone(b.owner_whatsapp || "") === normalized);
  if (business) {
    // Ensure owner row exists for next time
    const owners = await getOwners(business.id);
    if (owners.length === 0) {
      await getDb()
        .prepare(
          `INSERT INTO business_owners (id, business_id, name, phone, access_type, is_primary, added_at)
           VALUES (?, ?, ?, ?, 'equal', 1, ?)`,
        )
        .run(newId(), business.id, "Owner", normalized, nowIso());
      schedulePersistDb();
    }
    return {
      businessId: business.id,
      role: "equal_owner",
      name: "Owner",
      phone: normalized,
    };
  }

  return null;
}

/** Staff always stores name AND WhatsApp number — both required. */
export async function getStaff(businessId: string): Promise<StaffMember[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM staff WHERE business_id = ? ORDER BY added_at DESC")
    .all(businessId) as { id: string; name: string; phone: string; permission: Permission; added_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    permission: row.permission,
    addedAt: row.added_at,
  }));
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
  await getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, businessId, name, phone, input.permission, addedAt);

  schedulePersistDb();
  return { id, name, phone, permission: input.permission, addedAt };
}

export async function createAlert(
  businessId: string,
  input: { productId?: string | null; kind: string; title: string; body: string },
): Promise<AlertRow> {
  const id = newId();
  const created = nowIso();
  await getDb()
    .prepare(
      `INSERT INTO alerts (id, business_id, product_id, kind, title, body, created_at, seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, businessId, input.productId ?? null, input.kind, input.title, input.body, created);
  return await getDb().prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow;
}

export async function getAlerts(businessId: string, limit = 20): Promise<AlertRow[]> {
  return await getDb()
    .prepare("SELECT * FROM alerts WHERE business_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(businessId, limit) as AlertRow[];
}

export async function getTopSeller(businessId: string): Promise<{ name: string; value: number } | null> {
  const row = await getDb()
    .prepare(
      `SELECT p.name as name, SUM(s.quantity * s.unit_price) as value
       FROM sales s JOIN products p ON p.id = s.product_id
       WHERE s.business_id = ?
       GROUP BY s.product_id ORDER BY value DESC LIMIT 1`,
    )
    .get(businessId) as { name: string; value: number } | undefined;
  if (!row || !row.value) return null;
  return { name: row.name, value: Number(row.value) };
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

export type BackupHistoryEntry = {
  id: string;
  stampedAt: string;
  status: "success" | "failed";
  storagePath: string | null;
  error: string | null;
};

export async function listBackupHistory(businessId: string, limit = 50): Promise<BackupHistoryEntry[]> {
  await ensureDbReady();
  const rows = (await getDb()
    .prepare(
      `SELECT id, stamped_at, status, storage_path, error
       FROM backup_history
       WHERE business_id = ?
       ORDER BY stamped_at DESC
       LIMIT ?`,
    )
    .all(businessId, limit)) as {
    id: string;
    stamped_at: string;
    status: string;
    storage_path: string | null;
    error: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    stampedAt: row.stamped_at,
    status: row.status === "failed" ? "failed" : "success",
    storagePath: row.storage_path,
    error: row.error,
  }));
}

async function recordBackupHistory(
  businessId: string,
  stampedAt: string,
  status: "success" | "failed",
  storagePath: string | null,
  error: string | null,
) {
  await getDb()
    .prepare(
      `INSERT INTO backup_history (id, business_id, stamped_at, status, storage_path, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), businessId, stampedAt, status, storagePath, error);
  schedulePersistDb();
}

/** Full snapshot to separate storage (Vercel Blob when configured, else local backups folder). */
export async function runBackup(businessId: string): Promise<{ path: string; at: string; status: "success" }> {
  await ensureDbReady();
  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  const at = nowIso();
  const stamp = at.replace(/[:.]/g, "-");
  let storagePath: string | null = null;

  try {
    const snapshot = {
      backedUpAt: at,
      business,
      products: await getProducts(businessId),
      staff: await getStaff(businessId),
      owners: await getOwners(businessId),
      alerts: await getAlerts(businessId, 100),
      sales: await getDb()
        .prepare("SELECT * FROM sales WHERE business_id = ? ORDER BY recorded_at DESC")
        .all(businessId),
      priceHistory: await getDb()
        .prepare("SELECT * FROM price_history WHERE business_id = ? ORDER BY recorded_at DESC")
        .all(businessId),
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

/** Daily cron: snapshot every business into separate backup storage. */
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
    { name: "Laundry Soap", category: "Household", variant: "Bar", warehouse: 50, shop: 0, online: 15, price: 85, threshold: 24, history: [80, 80, 82, 84, 84, 85] },
  ] as const;

  for (const sample of samples) {
    const id = newId();
    const created = nowIso();
    await getDb()
      .prepare(
        `INSERT INTO products
         (id, business_id, name, category, variant, warehouse_qty, shop_qty, online_qty, purchase_price, restock_threshold, photo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        businessId,
        sample.name,
        sample.category,
        sample.variant,
        sample.warehouse,
        sample.shop,
        sample.online,
        sample.price,
        sample.threshold,
        "photo" in sample ? sample.photo : null,
        created,
      );

    for (let index = 0; index < sample.history.length; index++) {
      const price = sample.history[index];
      const recorded = new Date();
      recorded.setMonth(recorded.getMonth() - (sample.history.length - 1 - index));
      recorded.setDate(12);
      await getDb()
        .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
        .run(newId(), id, businessId, price, recorded.toISOString());
    
    }
  }

  // Staff: name + WhatsApp both required
  await getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), businessId, "Ahmed Khan", "+92 300 555 0142", "add", "2026-08-12T08:30:00.000Z");
  await getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), businessId, "Sara Ali", "+92 321 555 0198", "view", "2026-09-03T08:30:00.000Z");
}

export type ShopifyConnectionRow = {
  business_id: string;
  shop_domain: string;
  access_token: string;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_count: number;
};

export async function getShopifyConnection(businessId: string): Promise<ShopifyConnectionRow | null> {
  const row = await getDb()
    .prepare("SELECT * FROM business_shopify WHERE business_id = ?")
    .get(businessId) as ShopifyConnectionRow | undefined;
  return row ?? null;
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
  await getDb()
    .prepare(
      `INSERT INTO business_shopify (business_id, shop_domain, access_token, connected_at, last_sync_at, last_sync_error, last_sync_count)
       VALUES (?, ?, ?, ?, NULL, NULL, 0)
       ON CONFLICT(business_id) DO UPDATE SET
         shop_domain = excluded.shop_domain,
         access_token = excluded.access_token,
         connected_at = excluded.connected_at,
         last_sync_error = NULL`,
    )
    .run(businessId, shopDomain, accessToken, connectedAt);
  await updateBusiness(businessId, { connectedStores: 1 });
  schedulePersistDb();
  return await getShopifyConnectionPublic(businessId);
}

export async function clearShopifyConnection(businessId: string) {
  await getDb().prepare("DELETE FROM business_shopify WHERE business_id = ?").run(businessId);
  await updateBusiness(businessId, { connectedStores: 0 });
  schedulePersistDb();
}

export async function markShopifySyncResult(
  businessId: string,
  result: { ok: boolean; count: number; error?: string },
) {
  await getDb()
    .prepare(
      `UPDATE business_shopify
       SET last_sync_at = ?, last_sync_error = ?, last_sync_count = ?
       WHERE business_id = ?`,
    )
    .run(nowIso(), result.ok ? null : result.error || "Sync failed", result.count, businessId);
  if (result.ok) await updateBusiness(businessId, { connectedStores: 1 });
  schedulePersistDb();
}

export type ShopifySyncItem = {
  shopifyVariantId: string;
  name: string;
  category: string;
  variant: string;
  onlineQty: number;
  purchasePrice: number;
};

/** One-way pull: create/update products and set online qty from Shopify. */
export async function applyShopifyProductSync(businessId: string, items: ShopifySyncItem[]) {
  await clearSampleInventory(businessId);
  const existing = await getDb()
    .prepare("SELECT * FROM products WHERE business_id = ?")
    .all(businessId) as Record<string, unknown>[];

  let upserted = 0;
  for (const item of items) {
    const byVariant = existing.find((row) => String(row.shopify_variant_id || "") === item.shopifyVariantId);
    const byName = existing.find(
      (row) =>
        String(row.name).toLowerCase() === item.name.toLowerCase() &&
        String(row.variant || "").toLowerCase() === item.variant.toLowerCase(),
    );
    const match = byVariant || byName;

    if (match) {
      await getDb()
        .prepare(
          `UPDATE products
           SET online_qty = ?, shopify_variant_id = ?, category = COALESCE(NULLIF(category, ''), ?)
           WHERE id = ? AND business_id = ?`,
        )
        .run(item.onlineQty, item.shopifyVariantId, item.category, String(match.id), businessId);
      match.shopify_variant_id = item.shopifyVariantId;
      match.online_qty = item.onlineQty;
      upserted += 1;
      continue;
    }

    const id = newId();
    const created = nowIso();
    const threshold = Math.max(1, Math.round(item.onlineQty * 0.3) || 1);
    await getDb()
      .prepare(
        `INSERT INTO products
         (id, business_id, name, category, variant, warehouse_qty, shop_qty, online_qty, purchase_price, restock_threshold, photo, created_at, shopify_variant_id)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        businessId,
        item.name,
        item.category,
        item.variant,
        item.onlineQty,
        item.purchasePrice,
        threshold,
        created,
        item.shopifyVariantId,
      );
    if (item.purchasePrice > 0) {
      await getDb()
        .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
        .run(newId(), id, businessId, item.purchasePrice, created);
    }
    existing.push({
      id,
      name: item.name,
      variant: item.variant,
      shopify_variant_id: item.shopifyVariantId,
      online_qty: item.onlineQty,
    });
    upserted += 1;
  }

  schedulePersistDb();
  return upserted;
}

export async function buildBusinessState(businessId: string) {
  const business = await getBusiness(businessId);
  if (!business) return null;
  await ensureOwnersTable();
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
    connectedStores: business.connected_stores,
    ownerWhatsapp: business.owner_whatsapp,
    priceThreshold: business.price_threshold,
    alerts: await getAlerts(businessId, 10),
    isSample: Boolean(business.is_sample),
    shopify: await getShopifyConnectionPublic(businessId),
  };
}
