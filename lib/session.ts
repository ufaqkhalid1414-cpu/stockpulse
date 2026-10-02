import { createHash, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { getDb, newId, nowIso, schedulePersistDb } from "@/lib/db";
import { findBusinessByWhatsapp, getBusiness, type BusinessRow } from "@/lib/db/queries";
import { normalizePhone } from "@/lib/phone";

export const SESSION_COOKIE = "stockpulse_session";
/** @deprecated Prefer SESSION_COOKIE — kept only to clear legacy cookies */
export const BUSINESS_COOKIE = "stockpulse_business_id";

const SESSION_DAYS = 30;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export type AuthSession = {
  id: string;
  phone: string;
  businessId: string | null;
  expiresAt: string;
};

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieSecure() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function ensureAuthTables() {
  getDb().exec(`
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
}

export function generateOtpCode() {
  return String(randomInt(100000, 999999));
}

export function createOtp(phone: string): { code: string; cooldownMs: number } {
  ensureAuthTables();
  const normalized = normalizePhone(phone);
  const latest = getDb()
    .prepare("SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(normalized) as { created_at: string } | undefined;
  if (latest) {
    const age = Date.now() - new Date(latest.created_at).getTime();
    if (age < OTP_COOLDOWN_MS) {
      const err = new Error("Please wait a moment before requesting another code.");
      (err as Error & { cooldownMs?: number }).cooldownMs = OTP_COOLDOWN_MS - age;
      throw err;
    }
  }

  getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  const code = generateOtpCode();
  const created = nowIso();
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO otp_codes (id, phone, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
    .run(newId(), normalized, hashSecret(code), expires, created);
  schedulePersistDb();
  return { code, cooldownMs: OTP_COOLDOWN_MS };
}

export function verifyOtp(phone: string, code: string): boolean {
  ensureAuthTables();
  const normalized = normalizePhone(phone);
  const row = getDb()
    .prepare("SELECT * FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(normalized) as
    | { id: string; code_hash: string; expires_at: string; attempts: number }
    | undefined;
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM otp_codes WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    getDb().prepare("DELETE FROM otp_codes WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  if (hashSecret(code.trim()) !== row.code_hash) {
    getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  schedulePersistDb();
  return true;
}

export async function createSession(phone: string, businessId: string | null) {
  ensureAuthTables();
  const normalized = normalizePhone(phone);
  const token = randomBytes(32).toString("hex");
  const id = newId();
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, token_hash, business_id, phone, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, hashSecret(token), businessId, normalized, expires, created);
  schedulePersistDb();

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  // Clear legacy insecure cookie
  jar.delete(BUSINESS_COOKIE);
  return { id, token, expiresAt: expires };
}

export async function destroySession() {
  ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSecret(token));
    schedulePersistDb();
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(BUSINESS_COOKIE);
}

export async function getSession(): Promise<AuthSession | null> {
  ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare("SELECT id, phone, business_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashSecret(token)) as
    | { id: string; phone: string; business_id: string | null; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
    jar.delete(SESSION_COOKIE);
    schedulePersistDb();
    return null;
  }
  return {
    id: row.id,
    phone: row.phone,
    businessId: row.business_id,
    expiresAt: row.expires_at,
  };
}

export async function attachBusinessToSession(businessId: string) {
  const session = await getSession();
  if (!session) return null;
  getDb().prepare("UPDATE sessions SET business_id = ? WHERE id = ?").run(businessId, session.id);
  schedulePersistDb();
  return { ...session, businessId };
}

/** Authenticated owner session required. */
export async function requireSession(): Promise<AuthSession | null> {
  return getSession();
}

/** Authenticated session with an attached business — protects inventory APIs. */
export async function requireBusiness(): Promise<BusinessRow | null> {
  const session = await getSession();
  if (!session?.businessId) return null;
  const business = getBusiness(session.businessId);
  if (!business) return null;
  // Ensure session phone matches owner (prevents stale sessions on wrong account)
  const owner = (business.owner_whatsapp || "").replace(/\s/g, "").replace(/^whatsapp:/i, "");
  if (owner && owner !== session.phone) return null;
  return business;
}

export function resolveBusinessForPhone(phone: string) {
  return findBusinessByWhatsapp(normalizePhone(phone));
}

export function otpDevModeEnabled() {
  return process.env.OTP_DEV_MODE === "1" || process.env.NODE_ENV === "development";
}
