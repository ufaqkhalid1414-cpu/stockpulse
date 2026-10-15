import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { homePathForRole } from "@/lib/access";
import { exchangeGoogleCode, upsertGoogleAccount } from "@/lib/auth-accounts";
import { ensureDbReady, persistDb } from "@/lib/db";
import { findMembershipByEmail } from "@/lib/db/queries";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { publicSignupAllowed } from "@/lib/public-access";
import {
  createSession,
  resolveBusinessForEmail,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

const GOOGLE_STATE_COOKIE = "stockpulse_google_oauth";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function redirectLogin(error?: string) {
  const url = new URL("/login", appOrigin());
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    await ensureDbReady();
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");
    if (oauthError) {
      logWarn("google_oauth_denied", { error: oauthError });
      return redirectLogin("google_denied");
    }
    if (!code || !state) {
      return redirectLogin("google_failed");
    }

    const jar = await cookies();
    const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
    jar.delete(GOOGLE_STATE_COOKIE);
    if (!expected || expected !== state) {
      return redirectLogin("google_failed");
    }

    const profile = await exchangeGoogleCode(code);
    const account = await upsertGoogleAccount({
      email: profile.email,
      name: profile.name,
      googleSub: profile.sub,
    });

    const existing = await resolveBusinessForEmail(account.email);
    const membership = await findMembershipByEmail(account.email);
    const businessId = existing?.id ?? account.businessId ?? null;
    if (!publicSignupAllowed() && !businessId) {
      logWarn("google_invite_only_blocked", { email: account.email });
      return redirectLogin("invite_only");
    }
    const created = await createSession(null, businessId, {
      email: account.email,
      name: membership?.name ?? account.name,
      role: membership?.role ?? null,
    });
    await persistDb();
    logInfo("google_login", { email: account.email, businessId });

    const dest = membership
      ? homePathForRole(membership.role)
      : businessId
        ? "/dashboard"
        : "/login";
    const res = NextResponse.redirect(new URL(dest, appOrigin()));
    res.cookies.set(SESSION_COOKIE, created.token, created.cookieOptions ?? sessionCookieOptions());
    return res;
  } catch (err) {
    logError("google_callback_error", {}, err);
    return redirectLogin("google_failed");
  }
}
