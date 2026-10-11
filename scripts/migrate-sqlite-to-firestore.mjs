/**
 * One-shot: copy local SQLite data/stockpulse.sqlite → Firestore.
 * Requires .env.local with Firebase credentials already loaded.
 *
 *   node scripts/migrate-sqlite-to-firestore.mjs
 */
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
// Load .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const { initializeApp, cert, getApps } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");

function loadSa() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase env. Run scripts/load-firebase-env.mjs first.");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

const sa = loadSa();
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.projectId,
      clientEmail: sa.clientEmail,
      privateKey: sa.privateKey,
    }),
    projectId: sa.projectId,
  });
}
const db = getFirestore();

const sqlitePath = path.join(process.cwd(), "data", "stockpulse.sqlite");
if (!fs.existsSync(sqlitePath)) {
  console.log("No local SQLite file at data/stockpulse.sqlite — nothing to migrate.");
  process.exit(0);
}

const client = createClient({ url: `file:${sqlitePath.replace(/\\/g, "/")}` });

async function all(sql) {
  const rs = await client.execute(sql);
  return rs.rows;
}

function phoneDocId(phone) {
  return String(phone).replace(/\+/g, "p").replace(/\s+/g, "");
}

console.log("Reading SQLite…");
const businesses = await all("SELECT * FROM businesses");
console.log("Businesses:", businesses.length);

for (const b of businesses) {
  const id = String(b.id);
  console.log("Migrating business", id, b.name);
  await db
    .collection("businesses")
    .doc(id)
    .set({
      name: b.name,
      language: b.language || "en",
      ownerWhatsapp: b.owner_whatsapp ?? null,
      priceThreshold: Number(b.price_threshold ?? 10),
      connectedStores: Number(b.connected_stores ?? 0),
      lastBackup: b.last_backup ?? null,
      createdAt: b.created_at || new Date().toISOString(),
      isSample: Number(b.is_sample ?? 0),
    });

  const tables = [
    ["products", async (row) => {
      await db.collection("businesses").doc(id).collection("products").doc(String(row.id)).set({
        name: row.name,
        category: row.category || "",
        variant: row.variant || "",
        warehouseQty: Number(row.warehouse_qty ?? 0),
        shopQty: Number(row.shop_qty ?? 0),
        onlineQty: Number(row.online_qty ?? 0),
        purchasePrice: Number(row.purchase_price ?? 0),
        restockThreshold: Number(row.restock_threshold ?? 1),
        photo: row.photo ?? null,
        createdAt: row.created_at || new Date().toISOString(),
        shopifyVariantId: row.shopify_variant_id ?? null,
      });
    }],
    ["business_owners", async (row) => {
      const phone = String(row.phone || "");
      await db.collection("businesses").doc(id).collection("owners").doc(String(row.id)).set({
        name: row.name,
        phone,
        accessType: row.access_type === "co" ? "co" : "equal",
        isPrimary: Boolean(Number(row.is_primary)),
        addedAt: row.added_at || new Date().toISOString(),
      });
      if (phone) {
        await db
          .collection("phoneIndex")
          .doc(phoneDocId(phone))
          .set({
            phone,
            businessId: id,
            role: row.access_type === "co" ? "co_owner" : "equal_owner",
            name: row.name,
            memberId: String(row.id),
            kind: "owner",
          });
      }
    }],
    ["staff", async (row) => {
      const phone = String(row.phone || "");
      await db.collection("businesses").doc(id).collection("staff").doc(String(row.id)).set({
        name: row.name,
        phone,
        permission: row.permission === "add" ? "add" : "view",
        addedAt: row.added_at || new Date().toISOString(),
      });
      if (phone) {
        await db
          .collection("phoneIndex")
          .doc(phoneDocId(phone))
          .set({
            phone,
            businessId: id,
            role: row.permission === "add" ? "staff_add" : "staff_view",
            name: row.name,
            memberId: String(row.id),
            kind: "staff",
          });
      }
    }],
    ["price_history", async (row) => {
      await db.collection("businesses").doc(id).collection("priceHistory").doc(String(row.id)).set({
        productId: row.product_id,
        price: Number(row.price),
        recordedAt: row.recorded_at,
      });
    }],
    ["sales", async (row) => {
      await db.collection("businesses").doc(id).collection("sales").doc(String(row.id)).set({
        productId: row.product_id,
        location: row.location,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price ?? 0),
        recordedAt: row.recorded_at,
      });
    }],
    ["alerts", async (row) => {
      await db.collection("businesses").doc(id).collection("alerts").doc(String(row.id)).set({
        productId: row.product_id ?? null,
        kind: row.kind,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        seen: Number(row.seen ?? 0),
      });
    }],
    ["backup_history", async (row) => {
      await db.collection("businesses").doc(id).collection("backupHistory").doc(String(row.id)).set({
        stampedAt: row.stamped_at,
        status: row.status,
        storagePath: row.storage_path ?? null,
        error: row.error ?? null,
      });
    }],
  ];

  for (const [table, writer] of tables) {
    try {
      const rows = await all(`SELECT * FROM ${table} WHERE business_id = '${id.replace(/'/g, "''")}'`);
      console.log(`  ${table}: ${rows.length}`);
      for (const row of rows) await writer(row);
    } catch (e) {
      console.warn(`  skip ${table}:`, e.message);
    }
  }

  try {
    const shop = await all(
      `SELECT * FROM business_shopify WHERE business_id = '${id.replace(/'/g, "''")}'`,
    );
    if (shop[0]) {
      const s = shop[0];
      await db
        .collection("businesses")
        .doc(id)
        .collection("shopify")
        .doc("connection")
        .set({
          shopDomain: s.shop_domain,
          accessToken: s.access_token,
          connectedAt: s.connected_at,
          lastSyncAt: s.last_sync_at ?? null,
          lastSyncError: s.last_sync_error ?? null,
          lastSyncCount: Number(s.last_sync_count ?? 0),
        });
      console.log("  shopify: 1");
    }
  } catch {
    /* table missing */
  }
}

console.log("Done. Open Firebase console → Firestore to verify documents.");
process.exit(0);
