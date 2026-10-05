import fs from "fs";
import os from "os";
import path from "path";
import { createClient, type Client, type InArgs } from "@libsql/client";

export type SqlArg = string | number | null | boolean | Uint8Array | bigint;

type Stmt = {
  get: <T = Record<string, unknown>>(...args: SqlArg[]) => Promise<T | undefined>;
  all: <T = Record<string, unknown>>(...args: SqlArg[]) => Promise<T[]>;
  run: (...args: SqlArg[]) => Promise<{ changes: number }>;
};

export type AppDb = {
  exec: (sql: string) => Promise<void>;
  prepare: (sql: string) => Stmt;
};

const BLOB_DB_PATHNAME = "stockpulse-db/live.sqlite";

let client: Client | null = null;
let readyPromise: Promise<void> | null = null;
let appDb: AppDb | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;

function dataRoot() {
  return process.env.VERCEL
    ? path.join(os.tmpdir(), "stockpulse")
    : path.join(process.cwd(), "data");
}

function resolveLocalFileUrl() {
  const dataDir = dataRoot();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, "stockpulse.sqlite");
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function createDbClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoUrl) {
    return createClient({
      url: tursoUrl,
      authToken: tursoToken,
    });
  }
  return createClient({
    url: resolveLocalFileUrl(),
  });
}

function wrapClient(c: Client): AppDb {
  return {
    async exec(sql: string) {
      await c.executeMultiple(sql);
    },
    prepare(sql: string): Stmt {
      return {
        async get<T>(...args: SqlArg[]) {
          const rs = await c.execute({ sql, args: args as InArgs });
          return (rs.rows[0] as T | undefined) ?? undefined;
        },
        async all<T>(...args: SqlArg[]) {
          const rs = await c.execute({ sql, args: args as InArgs });
          return rs.rows as T[];
        },
        async run(...args: SqlArg[]) {
          const rs = await c.execute({ sql, args: args as InArgs });
          return { changes: Number(rs.rowsAffected ?? 0) };
        },
      };
    },
  };
}

async function migrate(db: AppDb) {
  await db.exec(`
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
      shopify_variant_id TEXT,
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

    CREATE TABLE IF NOT EXISTS business_shopify (
      business_id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      access_token TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      last_sync_at TEXT,
      last_sync_error TEXT,
      last_sync_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      business_id TEXT,
      phone TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      stamped_at TEXT NOT NULL,
      status TEXT NOT NULL,
      storage_path TEXT,
      error TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
    CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);
    CREATE INDEX IF NOT EXISTS idx_price_business ON price_history(business_id);
    CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_business ON alerts(business_id);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);
    CREATE INDEX IF NOT EXISTS idx_backup_business ON backup_history(business_id);
    CREATE INDEX IF NOT EXISTS idx_owners_business ON business_owners(business_id);
    CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON otp_requests(phone);
  `);

  try {
    await db.exec("ALTER TABLE businesses ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* exists */
  }
  try {
    await db.exec("ALTER TABLE products ADD COLUMN shopify_variant_id TEXT");
  } catch {
    /* exists */
  }
}

/** True when using hosted Turso (not a local file DB). */
export function usingTurso() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Durable away from the live DB process: Turso itself, or Blob-backed local file on Vercel. */
export function databaseIsDurable() {
  if (usingTurso()) return true;
  if (process.env.VERCEL && blobConfigured()) return true;
  return !process.env.VERCEL;
}

async function hydrateLocalFileFromBlob() {
  if (usingTurso() || !process.env.VERCEL || !blobConfigured()) return;
  const filePath = getDbPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(BLOB_DB_PATHNAME, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return;

    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    if (buf.length > 0) {
      fs.writeFileSync(filePath, buf);
      console.info("[db] hydrated local sqlite from Vercel Blob", buf.length, "bytes");
    }
  } catch (err) {
    console.warn("[db] blob hydrate skipped", err instanceof Error ? err.message : err);
  }
}

async function flushLocalDbToBlob() {
  if (usingTurso() || !blobConfigured()) return;
  // On Vercel this is required for durability; locally it's optional backup of the file DB.
  if (!process.env.VERCEL && process.env.BLOB_SYNC_LOCAL !== "1") return;

  const filePath = getDbPath();
  if (!fs.existsSync(filePath)) return;

  try {
    const { put } = await import("@vercel/blob");
    const body = fs.readFileSync(filePath);
    await put(BLOB_DB_PATHNAME, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/x-sqlite3",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    console.error("[db] blob flush failed", err);
    throw err;
  }
}

export async function ensureDbReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!usingTurso()) {
        await hydrateLocalFileFromBlob();
      }
      client = createDbClient();
      appDb = wrapClient(client);
      await migrate(appDb);
    })();
  }
  await readyPromise;
  return getDb();
}

export function getDb(): AppDb {
  if (!appDb) {
    throw new Error("Database not ready — call await ensureDbReady() first");
  }
  return appDb;
}

export function getLibsqlClient(): Client {
  if (!client) throw new Error("Database not ready — call await ensureDbReady() first");
  return client;
}

/** Flush local file DB to Vercel Blob when not on Turso. Turso needs no flush. */
export async function persistDb() {
  if (usingTurso()) return;
  if (persistInFlight) {
    await persistInFlight;
    return;
  }
  persistInFlight = flushLocalDbToBlob().finally(() => {
    persistInFlight = null;
  });
  await persistInFlight;
}

export function schedulePersistDb() {
  if (usingTurso()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistDb().catch((err) => console.error("[db] scheduled persist failed", err));
  }, 400);
}

export function getBackupDir() {
  const dir = path.join(dataRoot(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath() {
  return path.join(dataRoot(), "stockpulse.sqlite");
}

export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
