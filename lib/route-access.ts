import type { AccessRole } from "@/lib/types";

/** Legal / info pages — public, and reachable while logged in (no bounce to home). */
export const LEGAL_PATHS = ["/privacy", "/terms", "/contact"] as const;

/** Routes that do not require a session cookie. */
export const PUBLIC_PATHS = ["/", "/login", ...LEGAL_PATHS] as const;

const OWNER_ONLY = ["/dashboard", "/settings", "/staff", "/low-stock", "/activity", "/import"];
const STAFF_BLOCKED_PREFIX = "/prices";

export function isPublicPath(pathname: string) {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

export function isLegalPath(pathname: string) {
  return (LEGAL_PATHS as readonly string[]).includes(pathname);
}

/** Whether a logged-in, onboarded user should be redirected away from this public path. */
export function shouldBounceAuthenticatedFromPublic(pathname: string) {
  return isPublicPath(pathname) && !isLegalPath(pathname);
}

/** Client-side path allowlist mirroring Gate (server APIs still enforce separately). */
export function pathAllowed(pathname: string, role: AccessRole | null) {
  if (!role) return isPublicPath(pathname);
  if (role === "equal_owner" || role === "co_owner") return true;
  if (pathname === "/dashboard" || OWNER_ONLY.includes(pathname) || pathname.startsWith(STAFF_BLOCKED_PREFIX)) {
    return false;
  }
  if (isLegalPath(pathname) || pathname === "/" || pathname === "/login") return true;
  if (role === "staff_add") {
    return pathname === "/add-product" || pathname === "/items";
  }
  if (role === "staff_view" || role === "staff_sell" || role === "staff_move") {
    return pathname === "/items";
  }
  return false;
}
