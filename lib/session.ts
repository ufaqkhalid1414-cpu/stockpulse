import { createHash, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { ensureDbReady, firestoreDb, newId, nowIso } from "@/lib/db";
import {
  ensureOwnersTable,
  findMembershipByEmail,
  findMembershipByPhone,
  findMembershipForSession,
  getBusiness,
  type BusinessRow,
} from "@/lib/db/queries";
import { normalizePhone } from "@/lib/phone";
import type { AccessRole } from "@/lib/types";

export const SESSION_COOKIE = "stockpulse_session";
/** @deprecated Prefer SESSION_COOKIE — kept only to clear legacy cookies */
export const BUSINESS_COOKIE = "stockpulse_business_id";

const SESSION_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** Throttle lastSeenAt/expiresAt writes so we don't hammer Firestore on every request. */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_MAX = 3;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;

export type AuthSession = {
  id: string;
  phone: string;
  email: string | null;
  businessId: string | null;
  expiresAt: string;
};

type SessionMeta = {
  name?: string | null;
  role?: AccessRole | null;
  email?: string | null;
};

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieSecure() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function ensureAuthTables() {
  await ensureDbReady();
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
  const db = firestoreDb();

  const rateSnap = await db.collection("otpRequests").where("phone", "==", normalized).get();
  const recentCount = rateSnap.docs.filter((d) => String(d.data().createdAt) >= windowStart).length;
  if (recentCount >= OTP_RATE_MAX) {
    const err = new Error("Too many code requests for this number. Try again in about 10 minutes.");
    (err as Error & { rateLimited?: boolean; cooldownMs?: number }).rateLimited = true;
    (err as Error & { cooldownMs?: number }).cooldownMs = OTP_RATE_WINDOW_MS;
    throw err;
  }

  const codeSnap = await db.collection("otpCodes").where("phone", "==", normalized).get();
  const latest = codeSnap.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (latest?.createdAt) {
    const age = now - new Date(String(latest.createdAt)).getTime();
    if (age < OTP_COOLDOWN_MS) {
      const err = new Error("Please wait a moment before requesting another code.");
      (err as Error & { cooldownMs?: number }).cooldownMs = OTP_COOLDOWN_MS - age;
      throw err;
    }
  }

  const batch = db.batch();
  codeSnap.docs.forEach((d) => batch.delete(d.ref));
  rateSnap.docs
    .filter((d) => String(d.data().createdAt) < windowStart)
    .forEach((d) => batch.delete(d.ref));

  const code = generateOtpCode();
  const created = nowIso();
  const expires = new Date(now + OTP_TTL_MS).toISOString();
  batch.set(db.collection("otpCodes").doc(newId()), {
    phone: normalized,
    codeHash: hashSecret(code),
    expiresAt: expires,
    attempts: 0,
    createdAt: created,
  });
  batch.set(db.collection("otpRequests").doc(newId()), {
    phone: normalized,
    createdAt: created,
  });
  await batch.commit();
  return { code, cooldownMs: OTP_COOLDOWN_MS };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  await ensureAuthTables();
  const normalized = normalizePhone(phone);
  const db = firestoreDb();
  const snap = await db.collection("otpCodes").where("phone", "==", normalized).get();
  const doc = snap.docs.sort((a, b) =>
    String(b.data().createdAt).localeCompare(String(a.data().createdAt)),
  )[0];
  if (!doc) return false;
  const row = doc.data();
  if (new Date(String(row.expiresAt)).getTime() < Date.now()) {
    await doc.ref.delete();
    return false;
  }
  if (Number(row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await doc.ref.delete();
    return false;
  }
  if (hashSecret(code.trim()) !== row.codeHash) {
    await doc.ref.set({ attempts: Number(row.attempts ?? 0) + 1 }, { merge: true });
    return false;
  }
  const all = await db.collection("otpCodes").where("phone", "==", normalized).get();
  const batch = db.batch();
  all.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return true;
}

export function sessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/** Pure helper (no I/O) — exported for unit tests of the sliding-expiry rule. */
export function isSessionExpired(input: { lastSeenAt: string | null | undefined; expiresAt: string | null | undefined }, now = Date.now()) {
  const lastSeenAtMs = input.lastSeenAt ? new Date(input.lastSeenAt).getTime() : NaN;
  const expiresAtMs = input.expiresAt ? new Date(input.expiresAt).getTime() : NaN;
  const slidingExpired = !Number.isFinite(lastSeenAtMs) || now - lastSeenAtMs > SESSION_MAX_AGE_MS;
  const hardExpired = Number.isFinite(expiresAtMs) && now > expiresAtMs;
  return slidingExpired || hardExpired;
}

/** Pure helper — true when lastSeenAt should be refreshed (throttled write). */
export function shouldTouchSession(lastSeenAt: string | null | undefined, now = Date.now()) {
  const lastSeenAtMs = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
  return !Number.isFinite(lastSeenAtMs) || now - lastSeenAtMs > SESSION_TOUCH_INTERVAL_MS;
}

export async function createSession(
  phone: string | null | undefined,
  businessId: string | null,
  meta?: SessionMeta,
) {
  await ensureAuthTables();
  const normalized = phone ? normalizePhone(phone) : "";
  const email = meta?.email ? String(meta.email).trim().toLowerCase() : null;
  if (!normalized && !email) {
    throw new Error("A phone or email is required to create a session");
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSecret(token);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();

  // One document keyed by token hash — cookie lookup is a single read (no dual-write race).
  await firestoreDb().collection("sessions").doc(tokenHash).set({
    phone: normalized,
    email,
    businessId,
    createdAt: created,
    lastSeenAt: created,
    expiresAt: expires,
    revoked: false,
    personName: meta?.name ?? null,
    role: meta?.role ?? null,
  });

  const opts = sessionCookieOptions();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, opts);
  jar.delete(BUSINESS_COOKIE);
  return { id: tokenHash, token, expiresAt: expires, cookieOptions: opts };
}

export async function destroySession() {
  await ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashSecret(token);
    await firestoreDb().collection("sessions").doc(tokenHash).delete().catch(() => undefined);
    // Legacy dual-write cleanup (pre-fix)
    await firestoreDb().collection("sessionByToken").doc(tokenHash).delete().catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(BUSINESS_COOKIE);
}

/** Revoke every session belonging to a phone number (all devices). Returns count revoked. */
export async function revokeSessionsForPhone(phone: string): Promise<number> {
  await ensureAuthTables();
  const normalized = normalizePhone(phone);
  const snap = await firestoreDb().collection("sessions").where("phone", "==", normalized).get();
  if (snap.empty) return 0;
  const batch = firestoreDb().batch();
  snap.docs.forEach((d) => batch.set(d.ref, { revoked: true }, { merge: true }));
  await batch.commit();
  return snap.docs.length;
}

/** @deprecated alias of revokeSessionsForPhone — kept for naming clarity at call sites */
export const revokeAllSessionsForPhone = revokeSessionsForPhone;

/**
 * "Log out everywhere" — revoke every session for the current user's phone
 * (every device, including the one making the request). Used by the
 * owner-only Settings button.
 */
export async function logoutEverywhere(phone: string): Promise<number> {
  return revokeSessionsForPhone(phone);
}

export async function getSession(): Promise<AuthSession | null> {
  await ensureAuthTables();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashSecret(token);

  // Current format: sessions/{tokenHash}
  let snap = await firestoreDb().collection("sessions").doc(tokenHash).get();
  let sessionId = tokenHash;

  // Legacy format: sessionByToken/{hash} → sessions/{uuid}
  if (!snap.exists) {
    const lookup = await firestoreDb().collection("sessionByToken").doc(tokenHash).get();
    if (lookup.exists) {
      sessionId = String(lookup.data()?.sessionId ?? "");
      if (sessionId) {
        snap = await firestoreDb().collection("sessions").doc(sessionId).get();
        // Migrate legacy session to single-doc format
        if (snap.exists) {
          const row = snap.data()!;
          const migratedNow = nowIso();
          await firestoreDb().collection("sessions").doc(tokenHash).set({
            phone: row.phone,
            email: row.email ?? null,
            businessId: row.businessId ?? null,
            createdAt: row.createdAt ?? migratedNow,
            lastSeenAt: migratedNow,
            expiresAt: row.expiresAt ?? new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
            revoked: Boolean(row.revoked ?? false),
            personName: row.personName ?? null,
            role: row.role ?? null,
          });
          await snap.ref.delete().catch(() => undefined);
          await lookup.ref.delete().catch(() => undefined);
          snap = await firestoreDb().collection("sessions").doc(tokenHash).get();
          sessionId = tokenHash;
        }
      }
    }
  }

  if (!snap.exists) return null;
  const row = snap.data()!;

  if (row.revoked === true) {
    jar.delete(SESSION_COOKIE);
    jar.delete(BUSINESS_COOKIE);
    return null;
  }

  const now = Date.now();
  const lastSeenAt = row.lastSeenAt ? String(row.lastSeenAt) : String(row.createdAt ?? "");
  const expiresAt = row.expiresAt ? String(row.expiresAt) : "";

  if (isSessionExpired({ lastSeenAt, expiresAt }, now)) {
    await snap.ref.delete().catch(() => undefined);
    jar.delete(SESSION_COOKIE);
    jar.delete(BUSINESS_COOKIE);
    return null;
  }

  // Sliding expiry: throttle writes so a busy user isn't hammering Firestore.
  if (shouldTouchSession(lastSeenAt, now)) {
    const touchedAt = nowIso();
    const nextExpires = new Date(now + SESSION_MAX_AGE_MS).toISOString();
    await snap.ref.set({ lastSeenAt: touchedAt, expiresAt: nextExpires }, { merge: true }).catch(() => undefined);
  }

  return {
    id: sessionId,
    phone: String(row.phone ?? ""),
    email: row.email ? String(row.email) : null,
    businessId: row.businessId ?? null,
    expiresAt,
  };
}

export async function attachBusinessToSession(businessId: string) {
  const session = await getSession();
  if (!session) return null;
  await firestoreDb().collection("sessions").doc(session.id).set({ businessId }, { merge: true });
  return { ...session, businessId };
}

export async function requireSession(): Promise<AuthSession | null> {
  return await getSession();
}

export async function requireBusiness(): Promise<BusinessRow | null> {
  const session = await getSession();
  if (!session?.businessId) return null;
  const business = await getBusiness(session.businessId);
  if (!business) return null;
  const membership = await findMembershipForSession(session);
  if (!membership || membership.businessId !== business.id) return null;
  return business;
}

export async function resolveBusinessForPhone(phone: string) {
  const membership = await findMembershipByPhone(normalizePhone(phone));
  if (!membership) return null;
  return await getBusiness(membership.businessId);
}

export async function resolveBusinessForEmail(email: string) {
  const membership = await findMembershipByEmail(email);
  if (!membership) return null;
  return await getBusiness(membership.businessId);
}

export function otpDevModeEnabled() {
  return process.env.OTP_DEV_MODE === "1" || process.env.NODE_ENV === "development";
}
