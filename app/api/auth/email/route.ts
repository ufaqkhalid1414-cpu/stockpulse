import { homePathForRole } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import {
  createEmailAccount,
  createPasswordReset,
  getAuthAccountByEmail,
  isValidEmail,
  resetPasswordWithToken,
  verifyEmailPassword,
} from "@/lib/auth-accounts";
import { ensureDbReady, persistDb } from "@/lib/db";
import { findMembershipByEmail } from "@/lib/db/queries";
import { logError, logInfo, logWarn } from "@/lib/logger";
import {
  createSession,
  otpDevModeEnabled,
  resolveBusinessForEmail,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

type EmailAction = "signup" | "login" | "forgot" | "reset";

export async function POST(request: Request) {
  await ensureDbReady();
  const body = (await request.json()) as {
    action?: EmailAction;
    email?: string;
    password?: string;
    name?: string;
    token?: string;
  };

  try {
    if (body.action === "signup") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      if (!isValidEmail(email)) {
        return jsonNoStore({ error: "Enter a valid email address" }, { status: 400 });
      }
      const account = await createEmailAccount({ email, password, name });
      const created = await createSession(null, null, { email: account.email, name: account.name });
      await persistDb();
      logInfo("email_signup", { email: account.email });
      const res = jsonNoStore({
        ok: true,
        authenticated: true,
        needsSetup: true,
        phone: null,
        email: account.email,
        role: null,
        homePath: "/",
      });
      res.cookies.set(SESSION_COOKIE, created.token, created.cookieOptions ?? sessionCookieOptions());
      return res;
    }

    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!isValidEmail(email)) {
        return jsonNoStore({ error: "Enter a valid email address" }, { status: 400 });
      }
      let account;
      try {
        account = await verifyEmailPassword(email, password);
      } catch (err) {
        logWarn("email_login_failed", { email });
        return jsonNoStore(
          { error: err instanceof Error ? err.message : "Wrong email or password" },
          { status: 401 },
        );
      }
      const existing = await resolveBusinessForEmail(account.email);
      const membership = await findMembershipByEmail(account.email);
      const businessId = existing?.id ?? account.businessId ?? null;
      const created = await createSession(null, businessId, {
        email: account.email,
        name: membership?.name ?? account.name,
        role: membership?.role ?? null,
      });
      await persistDb();
      logInfo("email_login", { email: account.email, businessId });
      const res = jsonNoStore({
        ok: true,
        authenticated: true,
        needsSetup: !businessId,
        phone: null,
        email: account.email,
        role: membership?.role ?? null,
        homePath: membership ? homePathForRole(membership.role) : "/",
      });
      res.cookies.set(SESSION_COOKIE, created.token, created.cookieOptions ?? sessionCookieOptions());
      return res;
    }

    if (body.action === "forgot") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!isValidEmail(email)) {
        return jsonNoStore({ error: "Enter a valid email address" }, { status: 400 });
      }
      const { token } = await createPasswordReset(email);
      // No outbound email provider wired yet — in dev we return the token so reset still works.
      if (token && otpDevModeEnabled()) {
        logInfo("password_reset_dev", { email });
        return jsonNoStore({
          ok: true,
          resetToken: token,
          warning:
            "Password-reset email is not configured. Use the on-screen reset form (dev mode only).",
        });
      }
      if (token) {
        logWarn("password_reset_no_mailer", { email });
      }
      return jsonNoStore({
        ok: true,
        warning:
          "If an account exists for that email, a reset link would be sent. Email delivery is not configured on this server yet — use WhatsApp login or contact support.",
      });
    }

    if (body.action === "reset") {
      const token = String(body.token || "").trim();
      const password = String(body.password || "");
      if (!token) {
        return jsonNoStore({ error: "Reset token is required" }, { status: 400 });
      }
      const account = await resetPasswordWithToken(token, password);
      const existing = await resolveBusinessForEmail(account.email);
      const membership = await findMembershipByEmail(account.email);
      const businessId = existing?.id ?? (await getAuthAccountByEmail(account.email))?.businessId ?? null;
      const created = await createSession(null, businessId, {
        email: account.email,
        name: membership?.name ?? account.name,
        role: membership?.role ?? null,
      });
      await persistDb();
      logInfo("password_reset_ok", { email: account.email });
      const res = jsonNoStore({
        ok: true,
        authenticated: true,
        needsSetup: !businessId,
        phone: null,
        email: account.email,
        role: membership?.role ?? null,
        homePath: membership ? homePathForRole(membership.role) : "/",
      });
      res.cookies.set(SESSION_COOKIE, created.token, created.cookieOptions ?? sessionCookieOptions());
      return res;
    }

    return jsonNoStore({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    logError("email_auth_route_error", {}, err);
    return jsonNoStore(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      { status: 500 },
    );
  }
}
