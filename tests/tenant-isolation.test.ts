import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { assertSameBusiness, businessPath, isScopedToBusiness } from "@/lib/tenant";
import { sanitizeBusinessState } from "@/lib/permissions";
import { defaultState } from "@/lib/data";
import type { AppState } from "@/lib/types";

// Firebase-free: this suite only exercises pure helpers (lib/tenant.ts,
// lib/permissions.ts) — no firestore-admin import, no live credentials.

describe("tenant.ts — businessPath (every resource lives under businesses/{businessId}/...)", () => {
  test("builds the canonical businesses/{id}/segment path", () => {
    assert.equal(businessPath("biz-1", "products", "p1"), "businesses/biz-1/products/p1");
  });

  test("works with zero extra segments (the business doc itself)", () => {
    assert.equal(businessPath("biz-1"), "businesses/biz-1");
  });

  test("two different businesses never produce the same path for the same resource id", () => {
    const pathA = businessPath("biz-A", "products", "shared-id");
    const pathB = businessPath("biz-B", "products", "shared-id");
    assert.notEqual(pathA, pathB);
  });

  test("throws on a missing/blank businessId instead of building an unscoped path", () => {
    assert.throws(() => businessPath("", "products", "p1"));
    assert.throws(() => businessPath("   ", "products", "p1"));
  });

  test("throws on blank path segments", () => {
    assert.throws(() => businessPath("biz-1", "", "p1"));
  });
});

describe("tenant.ts — isScopedToBusiness", () => {
  test("true for a path under the given business", () => {
    assert.equal(isScopedToBusiness("businesses/biz-A/products/p1", "biz-A"), true);
  });

  test("false for a path under a DIFFERENT business (the cross-tenant case)", () => {
    assert.equal(isScopedToBusiness("businesses/biz-A/products/p1", "biz-B"), false);
  });

  test("false for a business id that is merely a string-prefix of another (biz-1 vs biz-10)", () => {
    assert.equal(isScopedToBusiness("businesses/biz-10/products/p1", "biz-1"), false);
  });

  test("true for the business root document itself", () => {
    assert.equal(isScopedToBusiness("businesses/biz-A", "biz-A"), true);
  });

  test("false for a blank businessId", () => {
    assert.equal(isScopedToBusiness("businesses/biz-A/products/p1", ""), false);
  });
});

describe("tenant.ts — assertSameBusiness (session businessId vs resource businessId)", () => {
  test("true when session and resource businessId match", () => {
    assert.equal(assertSameBusiness("biz-A", "biz-A"), true);
  });

  test("false (404-style, not 403-style) when session and resource businessId mismatch", () => {
    assert.equal(assertSameBusiness("biz-A", "biz-B"), false);
  });

  test("false when either side is missing — fail closed, never fail open", () => {
    assert.equal(assertSameBusiness(null, "biz-A"), false);
    assert.equal(assertSameBusiness("biz-A", null), false);
    assert.equal(assertSameBusiness(undefined, undefined), false);
    assert.equal(assertSameBusiness("", ""), false);
  });
});

function stateFor(businessName: string, productName: string): AppState {
  return {
    ...defaultState,
    onboarded: true,
    businessName,
    products: [
      {
        id: "p1",
        name: productName,
        category: "Staples",
        variant: "1kg",
        warehouseQty: 10,
        shopQty: 2,
        onlineQty: 0,
        purchasePrice: 100,
        restockThreshold: 5,
        piecesPerCarton: null,
        priceCompareUnit: "piece",
        priceEntries: [{ id: "e1", recordedAt: "2026-01-01", pricePerPiece: 100, piecesPerCarton: null }],
        priceHistory: [{ month: "jan", price: 100 }],
      },
    ],
    owners: [{ id: "o1", name: "Owner", phone: "+10000000001", access: "equal", isPrimary: true, addedAt: "2026-01-01" }],
  };
}

describe("sanitizeBusinessState — never mixes tenants (two businesses sanitized back to back)", () => {
  test("business A's sanitized output never contains business B's product/owner data, and vice versa", () => {
    const stateA = stateFor("Business A", "Rice (A)");
    const stateB = stateFor("Business B", "Oil (B)");

    const sanitizedA = sanitizeBusinessState("staff_view", stateA);
    const sanitizedB = sanitizeBusinessState("staff_view", stateB);

    assert.equal(sanitizedA.products[0].name, "Rice (A)");
    assert.equal(sanitizedB.products[0].name, "Oil (B)");
    assert.notEqual(sanitizedA.products[0].name, sanitizedB.products[0].name);

    // Staff must never see the owners list regardless of which business it is.
    assert.deepEqual(sanitizedA.owners, []);
    assert.deepEqual(sanitizedB.owners, []);
  });

  test("sanitizing state A does not mutate or leak into the separately-held state B object", () => {
    const stateA = stateFor("Business A", "Rice (A)");
    const stateB = stateFor("Business B", "Oil (B)");
    const beforeB = JSON.parse(JSON.stringify(stateB));

    sanitizeBusinessState("staff_add", stateA);

    assert.deepEqual(stateB, beforeB, "business B's state must be untouched by sanitizing business A's state");
  });
});
