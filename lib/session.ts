import { createHash, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { ensureDbReady, getDb, newId, nowIso, schedulePersistDb } from "@/lib/db";
import { ensureOwnersTable, findMembershipByPhone, getBusiness, type BusinessRow } from "@/lib/db/queries";
import { normalizePhone } from "@/lib/phone";

export const SESSION_COOKIE = "stockpulse_session";
/** @deprecated Prefer SESSION_COOKIE — kept only to clear legacy cookies */
export const BUSINESS_COOKIE = "stockpulse_business_id";

const SESSION_DAYS = 30;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Max OTP request attempts per phone in a rolling window (Prompt 8). */
const OTP_RATE_MAX = 3;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;

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

export async function ensureAuthTables() {
  await ensureDbReady();
  await getDb().exec(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);

    CREATE TABLE IF NOT EXISTS otp_requests (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON otp_requests(phone);

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
  await ensureOwnersTable();
}

export function generateOtpCode() {
  return String(randomInt(100000, 999999));
}

export async function createOtp(phone: string): Promise<{ code: string; cooldownMs: number }> {
  await ensureAuthTables();
  const normalized = normalizePhone(phone);
  const now = Date.now();
  const windowStart = new Date(now - OTP_RATE_WINDOW_MS).toISOString();

  const rateRow = (await getDb()
    .prepare("SELECT COUNT(*) AS c FROM otp_requests WHERE phone = ? AND created_at >= ?")
    .get(normalized, windowStart)) as { c: number | bigint } | undefined;
  const recentCount = Number(rateRow?.c ?? 0);
  if (recentCount >= OTP_RATE_MAX) {
    const err = new Error("Too many code requests for this number. Try again in about 10 minutes.");
    (err as Error & { rateLimited?: boolean; cooldownMs?: number }).rateLimited = true;
    (err as Error & { cooldownMs?: number }).cooldownMs = OTP_RATE_WINDOW_MS;
    throw err;
  }

  const latest = (await getDb()
    .prepare("SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(normalized)) as { created_at: string } | undefined;
  if (latest) {
    const age = now - new Date(latest.created_at).getTime();
    if (age < OTP_COOLDOWN_MS) {
      const err = new Error("Please wait a moment before requesting another code.");
      (err as Error & { cooldownMs?: number }).cooldownMs = OTP_COOLDOWN_MS - age;
      throw err;
    }
  }

  await getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  await getDb().prepare("DELETE FROM otp_requests WHERE created_at < ?").run(windowStart);

  const code = generateOtpCode();
  const created = nowIso();
  const expires = new Date(now + OTP_TTL_MS).toISOString();
  await getDb()
    .prepare(
      `INSERT INTO otp_codes (id, phone, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
    .run(newId(), normalized, hashSecret(code), expires, created);
  await getDb()
    .prepare(`INSERT INTO otp_requests (id, phone, created_at) VALUES (?, ?, ?)`)
    .run(newId(), normalized, created);
  schedulePersistDb();
  return { code, cooldownMs: OTP_COOLDOWN_MS };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  await ensureAuthTables();
  const normalized = normalizePhone(phone);
  const row = await getDb()
    .prepare("SELECT * FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(normalized) as
    | { id: string; code_hash: string; expires_at: string; attempts: number }
    | undefined;
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await getDb().prepare("DELETE FROM otp_codes WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await getDb().prepare("DELETE FROM otp_codes WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  if (hashSecret(code.trim()) !== row.code_hash) {
    await getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    schedulePersistDb();
    return false;
  }
  await getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  schedulePersistDb();
  return true;
}

export async function createSession(phone: string, businessId: string | null) {
  await ensureAuthTables();
  const normalized = normalizePhone(phone);
  const token = randomBytes(32).toString("hex");
  const id = newId();
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await getDb()
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
  jar.delete(BUSINESS_COOKIE);
  return { id, token, expiresAt: expires };
}

export async function destroySession() {
  await ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSecret(token));
    schedulePersistDb();
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(BUSINESS_COOKIE);
}

export async function getSession(): Promise<AuthSession | null> {
  await ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await getDb()
    .prepare("SELECT id, phone, business_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashSecret(token)) as
    | { id: string; phone: string; business_id: string | null; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await getDb().prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
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
  await getDb().prepare("UPDATE sessions SET business_id = ? WHERE id = ?").run(businessId, session.id);
  schedulePersistDb();
  return { ...session, businessId };
}

export async function requireSession(): Promise<AuthSession | null> {
  return await getSession();
}

/** Any logged-in member of the business (owner or staff). */
export async function requireBusiness(): Promise<BusinessRow | null> {
  const session = await getSession();
  if (!session?.businessId) return null;
  const business = await getBusiness(session.businessId);
  if (!business) return null;
  const membership = await findMembershipByPhone(session.phone);
  if (!membership || membership.businessId !== business.id) return null;
  return business;
}

export async function resolveBusinessForPhone(phone: string) {
  const membership = await findMembershipByPhone(normalizePhone(phone));
  if (!membership) return null;
  return await getBusiness(membership.businessId);
}

export function otpDevModeEnabled() {
  return process.env.OTP_DEV_MODE === "1" || process.env.NODE_ENV === "development";
}
