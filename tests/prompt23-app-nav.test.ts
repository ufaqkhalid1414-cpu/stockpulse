import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  CONTACT_PLACEHOLDER,
  footerNavLinks,
  isFooterNavActive,
  isMainNavActive,
  mainNavLinksForRole,
} from "@/lib/app-nav";
import { t } from "@/lib/i18n";
import {
  isLegalPath,
  isPublicPath,
  pathAllowed,
  shouldBounceAuthenticatedFromPublic,
} from "@/lib/route-access";
import type { AccessRole } from "@/lib/types";

const ALL_ROLES: AccessRole[] = [
  "equal_owner",
  "co_owner",
  "staff_add",
  "staff_view",
  "staff_sell",
  "staff_move",
];

describe("Prompt 23 — sidebar nav links by role", () => {
  test("owners and co-owners see authorized app pages (no fake Prices/Backups/Shopify routes)", () => {
    for (const role of ["equal_owner", "co_owner"] as const) {
      const hrefs = mainNavLinksForRole(role).map((l) => l.href);
      assert.deepEqual(hrefs, [
        "/dashboard",
        "/items",
        "/add-product",
        "/low-stock",
        "/staff",
        "/settings",
      ]);
      assert.ok(!hrefs.includes("/prices"));
      assert.ok(!hrefs.some((h) => h.includes("backup") || h.includes("shopify")));
    }
  });

  test("staff_add sees Add product + Stock only", () => {
    assert.deepEqual(
      mainNavLinksForRole("staff_add").map((l) => l.href),
      ["/add-product", "/items"],
    );
  });

  test("view/sell/move staff see Stock only — no Dashboard, Prices, Settings, People, Low stock", () => {
    for (const role of ["staff_view", "staff_sell", "staff_move"] as const) {
      const hrefs = mainNavLinksForRole(role).map((l) => l.href);
      assert.deepEqual(hrefs, ["/items"]);
      for (const blocked of ["/dashboard", "/settings", "/staff", "/low-stock", "/add-product", "/prices"]) {
        assert.ok(!hrefs.includes(blocked), `${role} must not see ${blocked}`);
      }
    }
  });

  test("footer always exposes Privacy and Contact", () => {
    assert.deepEqual(
      footerNavLinks().map((l) => l.href),
      ["/privacy", "/contact"],
    );
  });

  test("current page active state is per-route (Dashboard no longer owns Items)", () => {
    assert.equal(isMainNavActive("/dashboard", "/dashboard"), true);
    assert.equal(isMainNavActive("/items", "/dashboard"), false);
    assert.equal(isMainNavActive("/items", "/items"), true);
    assert.equal(isMainNavActive("/low-stock", "/low-stock"), true);
    assert.equal(isMainNavActive("/add-product", "/add-product"), true);
    assert.equal(isFooterNavActive("/privacy", "/privacy"), true);
    assert.equal(isFooterNavActive("/contact", "/contact"), true);
    assert.equal(isFooterNavActive("/privacy", "/contact"), false);
  });
});

describe("Prompt 23 — route access (Gate allowlist)", () => {
  test("restricted routes stay blocked for staff", () => {
    for (const role of ["staff_view", "staff_sell", "staff_move", "staff_add"] as const) {
      assert.equal(pathAllowed("/dashboard", role), false);
      assert.equal(pathAllowed("/settings", role), false);
      assert.equal(pathAllowed("/staff", role), false);
      assert.equal(pathAllowed("/low-stock", role), false);
      assert.equal(pathAllowed("/prices/abc", role), false);
      assert.equal(pathAllowed("/activity", role), false);
      assert.equal(pathAllowed("/import", role), false);
    }
    assert.equal(pathAllowed("/add-product", "staff_view"), false);
    assert.equal(pathAllowed("/add-product", "staff_add"), true);
    assert.equal(pathAllowed("/items", "staff_view"), true);
  });

  test("owners may open owner routes", () => {
    for (const role of ["equal_owner", "co_owner"] as const) {
      assert.equal(pathAllowed("/dashboard", role), true);
      assert.equal(pathAllowed("/settings", role), true);
      assert.equal(pathAllowed("/low-stock", role), true);
      assert.equal(pathAllowed("/prices/x", role), true);
    }
  });

  test("Privacy and Contact are public and stay reachable while logged in", () => {
    assert.equal(isPublicPath("/privacy"), true);
    assert.equal(isPublicPath("/contact"), true);
    assert.equal(isLegalPath("/privacy"), true);
    assert.equal(isLegalPath("/contact"), true);
    assert.equal(shouldBounceAuthenticatedFromPublic("/"), true);
    assert.equal(shouldBounceAuthenticatedFromPublic("/login"), true);
    assert.equal(shouldBounceAuthenticatedFromPublic("/privacy"), false);
    assert.equal(shouldBounceAuthenticatedFromPublic("/contact"), false);
    for (const role of ALL_ROLES) {
      assert.equal(pathAllowed("/privacy", role), true);
      assert.equal(pathAllowed("/contact", role), true);
    }
  });
});

describe("Prompt 23 — Privacy and Contact content", () => {
  test("Contact placeholder has no invented phone, email, or form claims", () => {
    assert.equal(t("en", "contactPlaceholder"), CONTACT_PLACEHOLDER);
    assert.match(CONTACT_PLACEHOLDER, /will be added soon/i);
    assert.doesNotMatch(CONTACT_PLACEHOLDER, /@|whatsapp|\+\d|phone|email|support@/i);
    const page = readFileSync(path.join(process.cwd(), "app/contact/page.tsx"), "utf8");
    assert.match(page, /CONTACT_PLACEHOLDER|contactPlaceholder/);
    assert.doesNotMatch(page, /mailto:|tel:|support@|form action/i);
  });

  test("existing Privacy page is preserved (not replaced with a stub)", () => {
    const page = readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");
    assert.match(page, /privacySections/);
    assert.doesNotMatch(page, /Privacy information will be added soon/);
  });
});

describe("Prompt 23 — logout redirect target", () => {
  test("AppShell logout sends users to /login via existing logout()", () => {
    const shell = readFileSync(path.join(process.cwd(), "components/AppShell.tsx"), "utf8");
    assert.match(shell, /await logout\(\)/);
    assert.match(shell, /window\.location\.href = "\/login"/);
  });
});
