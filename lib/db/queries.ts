import type { Lang } from "@/lib/i18n";
import type { Location, Permission, PricePoint, Product, StaffMember } from "@/lib/types";
import { getBackupDir, getDb, getDbPath, newId, nowIso, schedulePersistDb } from "@/lib/db";
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
    priceHistory: history,
  };
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][d.getMonth()];
}

export function getBusiness(id: string): BusinessRow | null {
  const row = getDb().prepare("SELECT * FROM businesses WHERE id = ?").get(id) as BusinessRow | undefined;
  if (!row) return null;
  return { ...row, is_sample: Number(row.is_sample ?? 0) };
}

export function listBusinesses(): BusinessRow[] {
  return getDb().prepare("SELECT * FROM businesses ORDER BY created_at DESC").all() as BusinessRow[];
}

export function createBusiness(input: {
  name: string;
  language?: Lang;
  ownerWhatsapp?: string;
  seedSample?: boolean;
}): BusinessRow {
  const id = newId();
  const created = nowIso();
  getDb()
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

  if (input.seedSample) seedSampleProducts(id);
  schedulePersistDb();
  return getBusiness(id)!;
}

export function updateBusiness(
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
  const current = getBusiness(id);
  if (!current) throw new Error("Business not found");
  getDb()
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
  return getBusiness(id)!;
}

/** Remove demo products/staff so real inventory never mixes with sample stock. */
export function clearSampleInventory(businessId: string) {
  const business = getBusiness(businessId);
  if (!business || !business.is_sample) return false;
  getDb().prepare("DELETE FROM sales WHERE business_id = ?").run(businessId);
  getDb().prepare("DELETE FROM alerts WHERE business_id = ?").run(businessId);
  getDb().prepare("DELETE FROM price_history WHERE business_id = ?").run(businessId);
  getDb().prepare("DELETE FROM products WHERE business_id = ?").run(businessId);
  getDb().prepare("DELETE FROM staff WHERE business_id = ?").run(businessId);
  getDb().prepare("UPDATE businesses SET is_sample = 0, connected_stores = 0 WHERE id = ?").run(businessId);
  schedulePersistDb();
  return true;
}

export function deleteBusiness(id: string) {
  getDb().prepare("DELETE FROM businesses WHERE id = ?").run(id);
  schedulePersistDb();
}

export function getPriceHistory(productId: string, businessId: string): PricePoint[] {
  const rows = getDb()
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

export function getRecentPurchasePrices(productId: string, businessId: string, limit = 3): number[] {
  const rows = getDb()
    .prepare(
      `SELECT price FROM price_history
       WHERE product_id = ? AND business_id = ?
       ORDER BY recorded_at DESC LIMIT ?`,
    )
    .all(productId, businessId, limit) as { price: number }[];
  return rows.map((r) => r.price).reverse();
}

export function getProducts(businessId: string): Product[] {
  const rows = getDb()
    .prepare("SELECT * FROM products WHERE business_id = ? ORDER BY created_at DESC")
    .all(businessId) as Record<string, unknown>[];
  return rows.map((row) => mapProduct(row, getPriceHistory(String(row.id), businessId)));
}

export function getProduct(businessId: string, productId: string): Product | null {
  const row = getDb()
    .prepare("SELECT * FROM products WHERE id = ? AND business_id = ?")
    .get(productId, businessId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapProduct(row, getPriceHistory(productId, businessId));
}

export function addProduct(
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
): Product {
  clearSampleInventory(businessId);

  const id = newId();
  const created = nowIso();
  const warehouse = input.location === "warehouse" ? input.quantity : 0;
  const shop = input.location === "shop" ? input.quantity : 0;
  const online = input.location === "online" ? input.quantity : 0;
  const threshold = Math.max(1, Math.round(input.quantity * 0.3));

  getDb()
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

  getDb()
    .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), id, businessId, input.purchasePrice, created);

  schedulePersistDb();
  return getProduct(businessId, id)!;
}

export function recordPurchasePrice(
  businessId: string,
  productId: string,
  price: number,
): { product: Product; alert: AlertRow | null } {
  const product = getProduct(businessId, productId);
  if (!product) throw new Error("Product not found");
  const business = getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  const previous = getRecentPurchasePrices(productId, businessId, 3);
  const recorded = nowIso();
  getDb()
    .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), productId, businessId, price, recorded);
  getDb().prepare(`UPDATE products SET purchase_price = ? WHERE id = ? AND business_id = ?`).run(price, productId, businessId);

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
        alert = createAlert(businessId, { productId, kind: "price", title, body });
      }
    }
  }

  schedulePersistDb();
  return { product: getProduct(businessId, productId)!, alert };
}

export function recordSale(
  businessId: string,
  input: { productId: string; location: Location; quantity: number },
): Product {
  const product = getProduct(businessId, input.productId);
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

  getDb()
    .prepare(`UPDATE products SET warehouse_qty = ?, shop_qty = ?, online_qty = ? WHERE id = ? AND business_id = ?`)
    .run(nextWarehouse, nextShop, nextOnline, input.productId, businessId);

  getDb()
    .prepare(
      `INSERT INTO sales (id, business_id, product_id, location, quantity, unit_price, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), businessId, input.productId, input.location, input.quantity, product.purchasePrice, nowIso());

  schedulePersistDb();
  return getProduct(businessId, input.productId)!;
}

/** Staff always stores name AND WhatsApp number — both required. */
export function getStaff(businessId: string): StaffMember[] {
  const rows = getDb()
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

export function addStaff(
  businessId: string,
  input: { name: string; phone: string; permission: Permission },
): StaffMember {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("WhatsApp number is required");

  const id = newId();
  const addedAt = nowIso();
  getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, businessId, name, phone, input.permission, addedAt);

  schedulePersistDb();
  return { id, name, phone, permission: input.permission, addedAt };
}

export function createAlert(
  businessId: string,
  input: { productId?: string | null; kind: string; title: string; body: string },
): AlertRow {
  const id = newId();
  const created = nowIso();
  getDb()
    .prepare(
      `INSERT INTO alerts (id, business_id, product_id, kind, title, body, created_at, seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, businessId, input.productId ?? null, input.kind, input.title, input.body, created);
  return getDb().prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow;
}

export function getAlerts(businessId: string, limit = 20): AlertRow[] {
  return getDb()
    .prepare("SELECT * FROM alerts WHERE business_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(businessId, limit) as AlertRow[];
}

export function getTopSeller(businessId: string): { name: string; value: number } | null {
  const row = getDb()
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

export function findProductByName(businessId: string, query: string): Product | null {
  const products = getProducts(businessId);
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    products.find((p) => p.name.toLowerCase() === q) ??
    products.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ??
    null
  );
}

export function findBusinessByWhatsapp(phone: string): BusinessRow | null {
  const normalized = phone.replace(/\s/g, "").replace(/^whatsapp:/i, "");
  return (
    listBusinesses().find(
      (b) => (b.owner_whatsapp || "").replace(/\s/g, "").replace(/^whatsapp:/i, "") === normalized,
    ) ?? null
  );
}

export function runBackup(businessId: string): { path: string; at: string } {
  const business = getBusiness(businessId);
  if (!business) throw new Error("Business not found");
  const at = nowIso();
  const stamp = at.replace(/[:.]/g, "-");
  const snapshot = {
    backedUpAt: at,
    business,
    products: getProducts(businessId),
    staff: getStaff(businessId),
    alerts: getAlerts(businessId, 100),
    sales: getDb().prepare("SELECT * FROM sales WHERE business_id = ? ORDER BY recorded_at DESC").all(businessId),
  };
  const file = path.join(getBackupDir(), `${businessId}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");
  fs.copyFileSync(getDbPath(), path.join(getBackupDir(), `full-${stamp}.sqlite`));
  updateBusiness(businessId, { lastBackup: at });
  return { path: file, at };
}

function seedSampleProducts(businessId: string) {
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
    getDb()
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

    sample.history.forEach((price, index) => {
      const recorded = new Date();
      recorded.setMonth(recorded.getMonth() - (sample.history.length - 1 - index));
      recorded.setDate(12);
      getDb()
        .prepare(`INSERT INTO price_history (id, product_id, business_id, price, recorded_at) VALUES (?, ?, ?, ?, ?)`)
        .run(newId(), id, businessId, price, recorded.toISOString());
    });
  }

  // Staff: name + WhatsApp both required
  getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), businessId, "Ahmed Khan", "+92 300 555 0142", "add", "2026-08-12T08:30:00.000Z");
  getDb()
    .prepare(`INSERT INTO staff (id, business_id, name, phone, permission, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), businessId, "Sara Ali", "+92 321 555 0198", "view", "2026-09-03T08:30:00.000Z");
}

export function buildBusinessState(businessId: string) {
  const business = getBusiness(businessId);
  if (!business) return null;
  return {
    id: business.id,
    onboarded: true,
    businessName: business.name,
    language: business.language,
    products: getProducts(businessId),
    staff: getStaff(businessId),
    lastBackup: business.last_backup,
    connectedStores: business.connected_stores,
    ownerWhatsapp: business.owner_whatsapp,
    priceThreshold: business.price_threshold,
    alerts: getAlerts(businessId, 10),
    isSample: Boolean(business.is_sample),
  };
}
