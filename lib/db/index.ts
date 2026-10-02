import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

function resolveDataDir() {
  // Vercel serverless only allows writes under /tmp (see Vercel KB on SQLite).
  if (process.env.VERCEL) return path.join(os.tmpdir(), "stockpulse");
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "stockpulse.sqlite");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BLOB_PATHNAME = "stockpulse-data/stockpulse.sqlite";

let db: DatabaseSync | null = null;
let hydratePromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  // Auth tables (OTP + sessions) — safe to create on every open
  db.exec(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      business_id TEXT,
      phone TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);
  `);
  return db;
}

/** Load durable SQLite from Vercel Blob (when configured) before serving requests. */
export async function ensureDbReady() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN && !fs.existsSync(DB_PATH)) {
        try {
          const { list } = await import("@vercel/blob");
          const { blobs } = await list({ prefix: "stockpulse-data/", limit: 10 });
          const match = blobs.find((b) => b.pathname === BLOB_PATHNAME) || blobs[0];
          if (match?.url) {
            const res = await fetch(match.url, {
              headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
            });
            if (res.ok) {
              if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
              const buf = Buffer.from(await res.arrayBuffer());
              fs.writeFileSync(DB_PATH, buf);
            }
          }
        } catch (err) {
          console.error("[db] blob hydrate failed", err);
        }
      }
      getDb();
    })();
  }
  await hydratePromise;
  return getDb();
}

/** Persist SQLite to Vercel Blob so pilot data survives cold starts. */
export async function persistDb() {
  if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    if (!fs.existsSync(DB_PATH)) return;
    const buf = fs.readFileSync(DB_PATH);
    await put(BLOB_PATHNAME, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/x-sqlite3",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    console.error("[db] blob persist failed", err);
  }
}

/** Debounced persist after writes (many inserts in one request → one upload). */
export function schedulePersistDb() {
  if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistDb();
  }, 50);
}

export function getBackupDir() {
  return BACKUP_DIR;
}

export function getDbPath() {
  return DB_PATH;
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      owner_whatsapp TEXT,
      price_threshold REAL NOT NULL DEFAULT 10,
      connected_stores INTEGER NOT NULL DEFAULT 0,
      last_backup TEXT,
      created_at TEXT NOT NULL,
      is_sample INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT '',
      warehouse_qty REAL NOT NULL DEFAULT 0,
      shop_qty REAL NOT NULL DEFAULT 0,
      online_qty REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      restock_threshold REAL NOT NULL DEFAULT 1,
      photo TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      price REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'view',
      added_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      location TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      product_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
    CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);
    CREATE INDEX IF NOT EXISTS idx_price_business ON price_history(business_id);
    CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_business ON alerts(business_id);
  `);

  // Older DBs created before is_sample existed
  const cols = database.prepare("PRAGMA table_info(businesses)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "is_sample")) {
    database.exec("ALTER TABLE businesses ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0");
  }
}

export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
