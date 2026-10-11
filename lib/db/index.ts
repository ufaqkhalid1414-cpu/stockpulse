import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { firebaseConfigured, getAdminFirestore } from "@/lib/firebase/admin";

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

let readyPromise: Promise<void> | null = null;

export function usingFirestore() {
  if (process.env.DATABASE_BACKEND === "sqlite") return false;
  if (process.env.DATABASE_BACKEND === "firestore") return true;
  return firebaseConfigured();
}

/** @deprecated Turso no longer used when Firestore is active */
export function usingTurso() {
  return false;
}

export function databaseIsDurable() {
  return usingFirestore() || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function newId() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

function dataRoot() {
  return process.env.VERCEL
    ? path.join(os.tmpdir(), "stockpulse")
    : path.join(process.cwd(), "data");
}

export function getBackupDir() {
  const dir = path.join(dataRoot(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath() {
  return path.join(dataRoot(), "stockpulse.sqlite");
}

export async function ensureDbReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!usingFirestore()) {
        throw new Error(
          "DATABASE_BACKEND must be firestore. Run: node scripts/load-firebase-env.mjs \"path\\to\\serviceAccount.json\"",
        );
      }
      if (!firebaseConfigured()) {
        throw new Error("Firebase credentials missing in .env.local");
      }
      // Init client only — avoid a write on every cold start (that was failing and
      // making /api/business return 503 → UI treated you as logged out).
      getAdminFirestore();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  await readyPromise;
}

/** SQLite helper — not used in Firestore mode */
export function getDb(): AppDb {
  throw new Error("getDb() is unavailable in Firestore mode");
}

export function schedulePersistDb() {
  /* Firestore writes are durable; no blob flush */
}

export async function persistDb() {
  /* no-op */
}

export function firestoreDb() {
  return getAdminFirestore();
}
