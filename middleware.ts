import { NextResponse, type NextRequest } from "next/server";

/**
 * Prompt 14 — security hardening middleware.
 *
 * This is intentionally lightweight: it only checks whether a session cookie
 * is *present* for protected pages (redirect to /login if not) and stamps
 * Cache-Control: no-store on every protected page/API response. It never
 * talks to Firestore — real role/permission checks always happen server-side
 * in the route handlers (requireAccess / requireOwnerAccess / sanitizeBusinessState).
 */

const SESSION_COOKIE = "stockpulse_session";

/**
 * Note: the landing page, /login, /privacy, and /terms are public by omission —
 * they're simply not in PROTECTED_PAGE_PREFIXES and not in the matcher below,
 * so this middleware never runs for them at all (no redirect, no header changes).
 */

/** API routes callable without a session (OTP / email / Google auth, Twilio webhook, cron, health probe). */
const PUBLIC_API_PREFIXES = [
  "/api/auth/otp",
  "/api/auth/email",
  "/api/auth/google",
  "/api/twilio/webhook",
  "/api/health",
  "/api/cron/",
];

/** Shop-owner / staff app pages that require a logged-in session. */
const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/staff",
  "/low-stock",
  "/prices",
  "/activity",
  "/items",
  "/add-product",
  "/import",
];

function isProtectedPage(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Protected pages: no session cookie at all → bounce to /login immediately.
  // (Full role/path checks still happen in Gate.tsx + every API route.)
  if (isProtectedPage(pathname) && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isApi = pathname.startsWith("/api/");
  const needsNoStore = isProtectedPage(pathname) || (isApi && !isPublicApi(pathname));
  if (!needsNoStore) return NextResponse.next();

  return withNoStore(NextResponse.next());
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/staff/:path*",
    "/low-stock/:path*",
    "/prices/:path*",
    "/activity/:path*",
    "/items/:path*",
    "/add-product/:path*",
    "/import/:path*",
    "/api/:path*",
  ],
};
