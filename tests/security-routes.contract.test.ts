/**
 * Table-driven contract for every mutating POST /api/stock action and every
 * owner-only route, documenting the expected outcome per role. This does not
 * spin up Firestore or an HTTP server (see docs/PROMPT-14-SECURITY.md for why);
 * it instead asserts the exact permission-matrix function that every route
 * handler calls (`allowedStockAction` / `can*` helpers from lib/access.ts), so
 * the contract breaks loudly if a route's authorization check ever drifts
 * from this table.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  canAccessDashboard,
  canAccessPrices,
  canAccessSettings,
  canAddProduct,
  canArchiveProduct,
  canCorrectStock,
  canEditProduct,
  canManageOwners,
  canManagePeople,
  canMutateStock,
  canResetBusiness,
  canSendReports,
  type AccessRole,
} from "@/lib/access";
import { allowedStockAction } from "@/lib/permissions";

type Allowed =
  | "equal_owner"
  | "co_owner"
  | "staff_add"
  | "staff_view"
  | "staff_sell"
  | "staff_move"
  | "none";

const ALL_ROLES: AccessRole[] = [
  "equal_owner",
  "co_owner",
  "staff_add",
  "staff_view",
  "staff_sell",
  "staff_move",
];

/** 200 = allowed (role may call it and gets real data back). 403 = requireAccess succeeds but role is forbidden. */
function expectedStatus(allowedRoles: Allowed[], role: AccessRole): 200 | 403 {
  return allowedRoles.includes(role) ? 200 : 403;
}

describe("POST /api/stock — action permission matrix (403 for everyone not listed)", () => {
  const matrix: { action: string; allowedRoles: Allowed[] }[] = [
    { action: "addProduct", allowedRoles: ["equal_owner", "co_owner", "staff_add"] },
    { action: "addStaff", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "removeStaff", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "updateStaffPermission", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "addOwner", allowedRoles: ["equal_owner"] },
    { action: "removeOwner", allowedRoles: ["equal_owner"] },
    // Staff permissions are split: add / sell / move are separate roles.
    { action: "addStock", allowedRoles: ["equal_owner", "co_owner", "staff_add"] },
    { action: "recordSale", allowedRoles: ["equal_owner", "co_owner", "staff_sell"] },
    { action: "moveStock", allowedRoles: ["equal_owner", "co_owner", "staff_move"] },
    { action: "correctCount", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "editProduct", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "setPriceCompareUnit", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "archiveProduct", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "restoreProduct", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "recordPurchasePrice", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "backup", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "sendDailyReport", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "sendMonthlyChart", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "sendWeeklyChart", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "updateNotificationPrefs", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "requestChangeMyNumber", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "confirmChangeMyNumber", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "addPlace", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "renamePlace", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "removePlace", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "addWarehouse", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "renameWarehouse", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "removeWarehouse", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "addShop", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "renameShop", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "removeShop", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "addOnlineStore", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "renameOnlineStore", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "removeOnlineStore", allowedRoles: ["equal_owner", "co_owner"] },
    { action: "resetAccount", allowedRoles: ["equal_owner"] },
  ];

  for (const { action, allowedRoles } of matrix) {
    for (const role of ALL_ROLES) {
      const expected = expectedStatus(allowedRoles, role);
      test(`${action} · ${role} → ${expected}`, () => {
        const allowed = allowedStockAction(role, action);
        assert.equal(allowed, expected === 200, `${action} for ${role} should resolve to HTTP ${expected}`);
      });
    }
  }
});

describe("GET/PATCH owner-only routes — requireOwnerAccess(label) contract", () => {
  const ownerOnlyRoutes: { route: string; check: (role: AccessRole) => boolean }[] = [
    { route: "GET /api/activity", check: canAccessDashboard }, // same owner gate as dashboard
    { route: "GET /api/system-status", check: canAccessDashboard },
    { route: "GET /api/shopify", check: canAccessDashboard },
    { route: "POST /api/shopify", check: canAccessDashboard },
    { route: "PATCH /api/stock (Settings)", check: canAccessSettings },
    // Prompt 15: recordSale is no longer gated by canAccessPrices (it moved to canMutateStock,
    // open to staff_add) — only recordPurchasePrice (the separate price-change action) still is.
    { route: "GET /prices/:id data (recordPurchasePrice)", check: canAccessPrices },
  ];

  for (const { route, check } of ownerOnlyRoutes) {
    for (const role of ALL_ROLES) {
      const expected: 200 | 403 = role === "equal_owner" || role === "co_owner" ? 200 : 403;
      test(`${route} · ${role} → ${expected}`, () => {
        assert.equal(check(role), expected === 200);
      });
    }
  }
});

describe("Equal-owner-only actions (Prompt 7 co-owner limits) stay equal-owner-only", () => {
  const equalOwnerOnly: { label: string; check: (role: AccessRole) => boolean }[] = [
    { label: "removeOwner / addOwner", check: canManageOwners },
    { label: "resetAccount (delete business)", check: canResetBusiness },
  ];

  for (const { label, check } of equalOwnerOnly) {
    test(`${label}: equal_owner allowed`, () => assert.equal(check("equal_owner"), true));
    test(`${label}: co_owner forbidden`, () => assert.equal(check("co_owner"), false));
    test(`${label}: staff_add forbidden`, () => assert.equal(check("staff_add"), false));
    test(`${label}: staff_view forbidden`, () => assert.equal(check("staff_view"), false));
  }

  test("canManagePeople (add/remove staff, change permission) is open to BOTH owner tiers", () => {
    assert.equal(canManagePeople("equal_owner"), true);
    assert.equal(canManagePeople("co_owner"), true);
    assert.equal(canManagePeople("staff_add"), false);
    assert.equal(canManagePeople("staff_view"), false);
  });
});

describe("addProduct is the one owner-only-elsewhere action staff_add may call", () => {
  test("staff_add is allowed to addProduct (purchase price included, per Prompt 14 decision)", () => {
    assert.equal(canAddProduct("staff_add"), true);
  });
  test("staff_view is never allowed to addProduct", () => {
    assert.equal(canAddProduct("staff_view"), false);
  });
});

describe("Prompt 15 — stock-accuracy predicates (canMutateStock / canCorrectStock / canEditProduct / canArchiveProduct)", () => {
  test("canMutateStock is true for owners and any staff with add/sell/move; false for view-only", () => {
    assert.equal(canMutateStock("equal_owner"), true);
    assert.equal(canMutateStock("co_owner"), true);
    assert.equal(canMutateStock("staff_add"), true);
    assert.equal(canMutateStock("staff_sell"), true);
    assert.equal(canMutateStock("staff_move"), true);
    assert.equal(canMutateStock("staff_view"), false);
  });

  test("canCorrectStock / canEditProduct / canArchiveProduct are owner-only (both tiers), block all staff", () => {
    for (const check of [canCorrectStock, canEditProduct, canArchiveProduct]) {
      assert.equal(check("equal_owner"), true);
      assert.equal(check("co_owner"), true);
      for (const staff of ["staff_add", "staff_view", "staff_sell", "staff_move"] as const) {
        assert.equal(check(staff), false);
      }
    }
  });
});
