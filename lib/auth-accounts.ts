import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { ensureDbReady, firestoreDb, newId, nowIso } from "@/lib/db";

export type AuthAccount = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  googleSub: string | null;
  businessId: string | null;
  createdAt: string;
  updatedAt: string;
};

const RESET_TTL_MS = 30 * 60 * 1000;

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function emailDocId(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return `${s}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function accounts() {
  return firestoreDb().collection("authAccounts");
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export async function getAuthAccountByEmail(email: string): Promise<AuthAccount | null> {
  await ensureDbReady();
  const snap = await accounts().doc(emailDocId(email)).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    id: snap.id,
    email: String(data.email ?? ""),
    name: String(data.name ?? ""),
    passwordHash: data.passwordHash ? String(data.passwordHash) : null,
    googleSub: data.googleSub ? String(data.googleSub) : null,
    businessId: data.businessId ? String(data.businessId) : null,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export async function createEmailAccount(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthAccount> {
  await ensureDbReady();
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("Enter a valid email address");
  if (String(input.password || "").length < 8) throw new Error("Password must be at least 8 characters");
  const existing = await getAuthAccountByEmail(email);
  if (existing) throw new Error("An account with that email already exists. Log in instead.");
  const now = nowIso();
  const id = emailDocId(email);
  const row: AuthAccount = {
    id,
    email,
    name: String(input.name || "").trim() || email.split("@")[0],
    passwordHash: hashPassword(input.password),
    googleSub: null,
    businessId: null,
    createdAt: now,
    updatedAt: now,
  };
  await accounts().doc(id).set(row);
  return row;
}

export async function verifyEmailPassword(email: string, password: string): Promise<AuthAccount> {
  const account = await getAuthAccountByEmail(email);
  if (!account || !account.passwordHash) throw new Error("Wrong email or password");
  if (!verifyPassword(password, account.passwordHash)) throw new Error("Wrong email or password");
  return account;
}

export async function upsertGoogleAccount(input: {
  email: string;
  name: string;
  googleSub: string;
}): Promise<AuthAccount> {
  await ensureDbReady();
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("Google did not return a valid email");
  const id = emailDocId(email);
  const existing = await getAuthAccountByEmail(email);
  const now = nowIso();
  if (existing) {
    await accounts().doc(id).set(
      {
        googleSub: input.googleSub,
        name: existing.name || input.name,
        updatedAt: now,
      },
      { merge: true },
    );
    return { ...existing, googleSub: input.googleSub, updatedAt: now };
  }
  const row: AuthAccount = {
    id,
    email,
    name: String(input.name || "").trim() || email.split("@")[0],
    passwordHash: null,
    googleSub: input.googleSub,
    businessId: null,
    createdAt: now,
    updatedAt: now,
  };
  await accounts().doc(id).set(row);
  return row;
}

export async function setAuthAccountBusiness(email: string, businessId: string) {
  await ensureDbReady();
  await accounts().doc(emailDocId(email)).set({ businessId, updatedAt: nowIso() }, { merge: true });
}

export async function createPasswordReset(email: string): Promise<{ token: string; expiresAt: string }> {
  const account = await getAuthAccountByEmail(email);
  if (!account || !account.passwordHash) {
    // Do not reveal whether the email exists — still return a fake ok to the UI.
    return { token: "", expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString() };
  }
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await firestoreDb().collection("passwordResets").doc(token).set({
    email: account.email,
    expiresAt,
    createdAt: nowIso(),
  });
  return { token, expiresAt };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<AuthAccount> {
  if (String(newPassword || "").length < 8) throw new Error("Password must be at least 8 characters");
  await ensureDbReady();
  const snap = await firestoreDb().collection("passwordResets").doc(token).get();
  if (!snap.exists) throw new Error("That reset link is invalid or expired");
  const data = snap.data()!;
  if (new Date(String(data.expiresAt)).getTime() < Date.now()) {
    await snap.ref.delete().catch(() => undefined);
    throw new Error("That reset link is invalid or expired");
  }
  const email = String(data.email);
  const account = await getAuthAccountByEmail(email);
  if (!account) throw new Error("That reset link is invalid or expired");
  await accounts().doc(account.id).set(
    {
      passwordHash: hashPassword(newPassword),
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await snap.ref.delete().catch(() => undefined);
  return { ...account, passwordHash: "(set)" };
}

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirect = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  email: string;
  name: string;
  sub: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirect = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error || "Google sign-in failed");
  }
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = (await profileRes.json()) as { email?: string; name?: string; sub?: string };
  if (!profile.email || !profile.sub) throw new Error("Google did not return an email");
  return {
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
    sub: profile.sub,
  };
}
