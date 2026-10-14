import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  canAccessDashboard,
  canAccessPrices,
  canAccessSettings,
  canAddProduct,
  canManageOwners,
  canManagePeople,
  canResetBusiness,
  canSendReports,
  homePathForRole,
  isOwnerRole,
  isStaffRole,
  type AccessRole,
} from "@/lib/access";
import { isSessionExpired, shouldTouchSession } from "@/lib/session";
import { sanitizeBusinessState, allowedStockAction } from "@/lib/permissions";
import { defaultState } from "@/lib/data";
import type { AppState, Product } from "@/lib/types";

const ROLES: AccessRole[] = [
  "equal_owner",
  "co_owner",
  "staff_add",
  "staff_view",
  "staff_sell",
  "staff_move",
];

function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Rice",
    category: "Staples",
    variant: "5kg",
    warehouseQty: 10,
    shopQty: 2,
    onlineQty: 0,
    purchasePrice: 2450,
    restockThreshold: 5,
    piecesPerCarton: null,
    priceHistory: [{ month: "jan", price: 2400 }, { month: "feb", price: 2450 }],
    ...overrides,
    priceCompareUnit: overrides.priceCompareUnit ?? "piece",
    priceEntries: overrides.priceEntries ?? [
      { id: "e1", recordedAt: "2026-01-01", pricePerPiece: 2400, piecesPerCarton: null },
      { id: "e2", recordedAt: "2026-02-01", pricePerPiece: 2450, piecesPerCarton: null },
    ],
  };
}

function sampleState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...defaultState,
    onboarded: true,
    businessName: "General Store",
    products: [sampleProduct()],
    staff: [{ id: "s1", name: "Staffer", phone: "+923005550142", permission: "add", addedAt: "2026-01-01" }],
    owners: [{ id: "o1", name: "Owner", phone: "+923000000001", access: "equal", isPrimary: true, addedAt: "2026-01-01" }],
    backupHistory: [{ id: "b1", stampedAt: "2026-01-01", status: "success", storagePath: "x", error: null }],
    activityHistory: [
      {
        id: "a1",
        category: "stock",
        action: "stock_deducted",
        actorPhone: "+923000000001",
        actorName: "Owner",
        actorRole: "equal_owner",
        productId: "p1",
        productName: "Rice",
        location: "shop",
        fromLocation: null,
        toLocation: null,
        quantityChange: -1,
        previousValue: 3,
        newValue: 2,
        previousTotal: 13,
        newTotal: 12,
        summary: "Deducted 1 Rice",
        detail: null,
        status: "success",
        createdAt: "2026-01-01",
      },
    ],
    alerts: [{ id: "al1", business_id: "b1", product_id: "p1", kind: "low_stock", title: "Low", body: "Low", created_at: "2026-01-01", seen: 0 }],
    ownerWhatsapp: "+923000000001",
    lastBackup: "2026-01-01",
    shopify: { connected: true, shopDomain: "shop.myshopify.com", connectedAt: "2026-01-01", lastSyncAt: "2026-01-02", lastSyncError: null, lastSyncCount: 3 },
    ...overrides,
  };
}

describe("access.ts — role predicates (server-side permission matrix)", () => {
  test("isOwnerRole / isStaffRole partition the four roles", () => {
    for (const role of ROLES) {
      assert.equal(isOwnerRole(role) || isStaffRole(role), true, `${role} must be owner xor staff`);
      assert.notEqual(isOwnerRole(role), isStaffRole(role), `${role} cannot be both`);
    }
    assert.equal(isOwnerRole("equal_owner"), true);
    assert.equal(isOwnerRole("co_owner"), true);
    assert.equal(isStaffRole("staff_add"), true);
    assert.equal(isStaffRole("staff_view"), true);
    assert.equal(isStaffRole("staff_sell"), true);
    assert.equal(isStaffRole("staff_move"), true);
  });

  test("owner-only screens (dashboard, settings, prices, reports) reject every staff role", () => {
    const checks = [canAccessDashboard, canAccessSettings, canAccessPrices, canSendReports];
    for (const check of checks) {
      assert.equal(check("equal_owner"), true);
      assert.equal(check("co_owner"), true);
      for (const staff of ["staff_add", "staff_view", "staff_sell", "staff_move"] as const) {
        assert.equal(check(staff), false);
      }
    }
  });

  test("canAddProduct allows owners + staff_add, blocks other staff", () => {
    assert.equal(canAddProduct("equal_owner"), true);
    assert.equal(canAddProduct("co_owner"), true);
    assert.equal(canAddProduct("staff_add"), true);
    assert.equal(canAddProduct("staff_view"), false);
    assert.equal(canAddProduct("staff_sell"), false);
    assert.equal(canAddProduct("staff_move"), false);
  });

  test("canManagePeople allows both owner tiers, blocks staff", () => {
    assert.equal(canManagePeople("equal_owner"), true);
    assert.equal(canManagePeople("co_owner"), true);
    for (const staff of ["staff_add", "staff_view", "staff_sell", "staff_move"] as const) {
      assert.equal(canManagePeople(staff), false);
    }
  });

  test("canManageOwners / canResetBusiness are equal-owner only (co-owner limits, Prompt 7)", () => {
    assert.equal(canManageOwners("equal_owner"), true);
    assert.equal(canManageOwners("co_owner"), false);
    for (const staff of ["staff_add", "staff_view", "staff_sell", "staff_move"] as const) {
      assert.equal(canManageOwners(staff), false);
      assert.equal(canResetBusiness(staff), false);
    }

    assert.equal(canResetBusiness("equal_owner"), true);
    assert.equal(canResetBusiness("co_owner"), false);
  });

  test("homePathForRole never sends staff to an owner-only screen", () => {
    assert.equal(homePathForRole("equal_owner"), "/dashboard");
    assert.equal(homePathForRole("co_owner"), "/dashboard");
    assert.equal(homePathForRole("staff_add"), "/add-product");
    assert.equal(homePathForRole("staff_view"), "/items");
    assert.equal(homePathForRole("staff_sell"), "/items");
    assert.equal(homePathForRole("staff_move"), "/items");
  });
});

const ALL_MATRIX_ACTIONS = [
  "addProduct",
  "addStaff",
  "removeStaff",
  "updateStaffPermission",
  "addOwner",
  "removeOwner",
  "addStock",
  "recordSale",
  "moveStock",
  "correctCount",
  "editProduct",
  "setPriceCompareUnit",
  "archiveProduct",
  "restoreProduct",
  "recordPurchasePrice",
  "backup",
  "sendDailyReport",
  "sendMonthlyChart",
  "resetAccount",
];

describe("permissions.ts — allowedStockAction matrix", () => {
  test("staff_view can only read — every mutating action is denied", () => {
    for (const action of ALL_MATRIX_ACTIONS) {
      assert.equal(allowedStockAction("staff_view", action), false, `staff_view must not be allowed to ${action}`);
    }
  });

  test("staff_add may addProduct + addStock only — not sell/move or owner-only actions", () => {
    assert.equal(allowedStockAction("staff_add", "addProduct"), true);
    assert.equal(allowedStockAction("staff_add", "addStock"), true);
    assert.equal(allowedStockAction("staff_add", "recordSale"), false);
    assert.equal(allowedStockAction("staff_add", "moveStock"), false);
    assert.equal(allowedStockAction("staff_add", "correctCount"), false);
    assert.equal(allowedStockAction("staff_add", "editProduct"), false);
    assert.equal(allowedStockAction("staff_add", "archiveProduct"), false);
    assert.equal(allowedStockAction("staff_add", "restoreProduct"), false);
    assert.equal(allowedStockAction("staff_add", "recordPurchasePrice"), false);
    assert.equal(allowedStockAction("staff_add", "addStaff"), false);
    assert.equal(allowedStockAction("staff_add", "removeOwner"), false);
  });

  test("staff_sell may recordSale only; staff_move may moveStock only", () => {
    assert.equal(allowedStockAction("staff_sell", "recordSale"), true);
    assert.equal(allowedStockAction("staff_sell", "addStock"), false);
    assert.equal(allowedStockAction("staff_sell", "moveStock"), false);
    assert.equal(allowedStockAction("staff_sell", "addProduct"), false);
    assert.equal(allowedStockAction("staff_move", "moveStock"), true);
    assert.equal(allowedStockAction("staff_move", "addStock"), false);
    assert.equal(allowedStockAction("staff_move", "recordSale"), false);
    assert.equal(allowedStockAction("staff_move", "addProduct"), false);
  });

  test("co_owner can run the business but not touch ownership/account deletion", () => {
    assert.equal(allowedStockAction("co_owner", "addProduct"), true);
    assert.equal(allowedStockAction("co_owner", "addStock"), true);
    assert.equal(allowedStockAction("co_owner", "recordSale"), true);
    assert.equal(allowedStockAction("co_owner", "moveStock"), true);
    assert.equal(allowedStockAction("co_owner", "correctCount"), true);
    assert.equal(allowedStockAction("co_owner", "editProduct"), true);
    assert.equal(allowedStockAction("co_owner", "archiveProduct"), true);
    assert.equal(allowedStockAction("co_owner", "addStaff"), true);
    assert.equal(allowedStockAction("co_owner", "removeStaff"), true);
    assert.equal(allowedStockAction("co_owner", "addOwner"), false);
    assert.equal(allowedStockAction("co_owner", "removeOwner"), false);
    assert.equal(allowedStockAction("co_owner", "resetAccount"), false);
  });

  test("equal_owner may do everything in the matrix", () => {
    for (const action of ALL_MATRIX_ACTIONS) {
      assert.equal(allowedStockAction("equal_owner", action), true, `equal_owner must be allowed to ${action}`);
    }
  });

  test("unknown actions are always denied, for every role", () => {
    for (const role of ROLES) {
      assert.equal(allowedStockAction(role, "doSomethingUnknown"), false);
    }
  });
});

describe("permissions.ts — sanitizeBusinessState (business-payload isolation)", () => {
  test("owners (equal + co) receive the full, unfiltered state", () => {
    const state = sampleState();
    for (const role of ["equal_owner", "co_owner"] as const) {
      const sanitized = sanitizeBusinessState(role, state);
      assert.deepEqual(sanitized, state, `${role} must see the unmodified state object`);
    }
  });

  test("staff (add + view) keep purchasePrice on products but lose price history", () => {
    const state = sampleState();
    for (const role of ["staff_add", "staff_view", "staff_sell", "staff_move"] as const) {
      const sanitized = sanitizeBusinessState(role, state);
      assert.equal(sanitized.products.length, 1);
      assert.equal(sanitized.products[0].purchasePrice, 2450, "staff must still see purchase price per Prompt 14 decision");
      assert.deepEqual(sanitized.products[0].priceHistory, [], "price history arrays must be emptied for staff");
    }
  });

  test("staff never receive owners/staff lists, backups, activity log, alerts, Shopify secrets, or the owner's WhatsApp", () => {
    const state = sampleState();
    const sanitized = sanitizeBusinessState("staff_view", state);
    assert.deepEqual(sanitized.owners, []);
    assert.deepEqual(sanitized.staff, []);
    assert.deepEqual(sanitized.backupHistory, []);
    assert.deepEqual(sanitized.activityHistory, []);
    assert.deepEqual(sanitized.alerts, []);
    assert.equal(sanitized.lastBackup, null);
    assert.equal(sanitized.ownerWhatsapp, null);
    assert.equal(sanitized.shopify?.connected, false);
    assert.equal(sanitized.shopify?.shopDomain, null);
  });

  test("sanitizeBusinessState does not mutate the input state (no shared references leaking back)", () => {
    const state = sampleState();
    const before = JSON.parse(JSON.stringify(state));
    sanitizeBusinessState("staff_add", state);
    assert.deepEqual(state, before, "sanitizing for staff must not mutate the owner's original state object");
  });
});

describe("session.ts — sliding 30-day expiry + touch throttling (pure helpers, no Firestore)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-06-15T12:00:00.000Z");

  test("a fresh session (just seen, future expiresAt) is not expired", () => {
    const lastSeenAt = new Date(now - 5 * 60 * 1000).toISOString();
    const expiresAt = new Date(now + 30 * DAY).toISOString();
    assert.equal(isSessionExpired({ lastSeenAt, expiresAt }, now), false);
  });

  test("sliding rule: expired once lastSeenAt is more than 30 days in the past, even if expiresAt hasn't passed", () => {
    const lastSeenAt = new Date(now - 31 * DAY).toISOString();
    const expiresAt = new Date(now + DAY).toISOString(); // not yet hit, but lastSeenAt rule still fires
    assert.equal(isSessionExpired({ lastSeenAt, expiresAt }, now), true);
  });

  test("hard rule: expired once expiresAt has passed, even if lastSeenAt is recent", () => {
    const lastSeenAt = new Date(now - 60 * 1000).toISOString();
    const expiresAt = new Date(now - 1000).toISOString();
    assert.equal(isSessionExpired({ lastSeenAt, expiresAt }, now), true);
  });

  test("missing lastSeenAt / expiresAt is treated as expired (fail closed)", () => {
    assert.equal(isSessionExpired({ lastSeenAt: null, expiresAt: null }, now), true);
    assert.equal(isSessionExpired({ lastSeenAt: undefined, expiresAt: new Date(now + DAY).toISOString() }, now), true);
  });

  test("shouldTouchSession throttles writes to roughly once every 5+ minutes", () => {
    const justNow = new Date(now - 60 * 1000).toISOString();
    const sixMinutesAgo = new Date(now - 6 * 60 * 1000).toISOString();
    assert.equal(shouldTouchSession(justNow, now), false, "must not rewrite lastSeenAt on every single request");
    assert.equal(shouldTouchSession(sixMinutesAgo, now), true, "must refresh lastSeenAt once the throttle window passes");
    assert.equal(shouldTouchSession(undefined, now), true, "missing lastSeenAt always needs a write");
  });
});
