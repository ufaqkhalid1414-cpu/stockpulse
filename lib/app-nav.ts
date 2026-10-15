import type { AccessRole } from "@/lib/types";
import type { CopyKey } from "@/lib/i18n";

export type AppNavLink = {
  href: string;
  key: CopyKey;
};

function isOwnerRole(role: AccessRole) {
  return role === "equal_owner" || role === "co_owner";
}

function isStaffRole(role: AccessRole) {
  return (
    role === "staff_view" ||
    role === "staff_add" ||
    role === "staff_sell" ||
    role === "staff_move"
  );
}

/**
 * Main sidebar links for the current role.
 * Only existing routes; Backups and Shopify live under Settings (no separate pages).
 * Prices are per-product (`/prices/[id]`) — no list route to link.
 * Keep this file free of server-only imports (session / next/headers).
 */
export function mainNavLinksForRole(role: AccessRole | null): AppNavLink[] {
  if (!role) return [];

  if (role === "staff_add") {
    return [
      { href: "/add-product", key: "addProduct" },
      { href: "/items", key: "navStock" },
    ];
  }
  if (isStaffRole(role)) {
    return [{ href: "/items", key: "navStock" }];
  }
  if (!isOwnerRole(role)) return [];

  return [
    { href: "/dashboard", key: "navDashboard" },
    { href: "/items", key: "navStock" },
    { href: "/add-product", key: "addProduct" },
    { href: "/low-stock", key: "navLowStock" },
    { href: "/staff", key: "navPeople" },
    { href: "/settings", key: "navSettings" },
  ];
}

/** Bottom section: Privacy + Contact (Logout is an action, not a link). */
export function footerNavLinks(): AppNavLink[] {
  return [
    { href: "/privacy", key: "navPrivacy" },
    { href: "/contact", key: "navContact" },
  ];
}

export const CONTACT_PLACEHOLDER = "Contact information will be added soon.";

export function isMainNavActive(pathname: string, href: string) {
  if (href === "/items") return pathname === "/items";
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/settings") return pathname === "/settings";
  if (href === "/staff") return pathname === "/staff";
  if (href === "/low-stock") return pathname === "/low-stock";
  if (href === "/add-product") return pathname === "/add-product";
  return pathname === href;
}

export function isFooterNavActive(pathname: string, href: string) {
  return pathname === href;
}
