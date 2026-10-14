/**
 * Prompt 15 — Stock Accuracy. Covers the pure math (add/move/correct, on top
 * of the existing deduction tests in tests/stock-math.test.ts), the
 * idempotency-key decision logic (in-memory fake store — no Firestore), and
 * the extended permission matrix (staff_view/staff_add vs. correct/edit/
 * archive). No live Firestore credentials are touched, consistent with the
 * rest of this test suite (see docs/PROMPT-14-SECURITY.md §3).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyStockAdd,
  applyStockCorrection,
  applyStockDeduction,
  applyStockMove,
  InsufficientStockError,
  totalAcrossLocations,
  type LocationQtys,
} from "@/lib/stock-math";
import { isIdempotencyRecordExpired, withIdempotency, type IdempotencyStore } from "@/lib/idempotency";
import { allowedStockAction } from "@/lib/permissions";
import type { AccessRole } from "@/lib/access";

function qtys(overrides: Partial<LocationQtys> = {}): LocationQtys {
  const warehouseQty = overrides.warehouseQty ?? 50;
  const shopQty = overrides.shopQty ?? 20;
  const onlineQty = overrides.onlineQty ?? 10;
  const stockByPlace =
    overrides.stockByPlace ?? { warehouse: warehouseQty, shop: shopQty, online: onlineQty };
  return { warehouseQty, shopQty, onlineQty, stockByPlace };
}

describe("Prompt 15 — the exact walkthrough from the spec (50+20+10=80; add 5 shop=85; remove 10 warehouse=70)", () => {
  test("starting totals are 80", () => {
    assert.equal(totalAcrossLocations(qtys()), 80);
  });

  test("add 5 to shop -> 85 total, only shop changes", () => {
    const result = applyStockAdd(qtys(), "shop", 5);
    assert.equal(result.next.warehouseQty, 50);
    assert.equal(result.next.shopQty, 25);
    assert.equal(result.next.onlineQty, 10);
    assert.equal(result.newTotal, 85);
  });

  test("remove 10 from warehouse -> 70 total, only warehouse changes", () => {
    const result = applyStockDeduction(qtys(), "warehouse", 10);
    assert.equal(result.next.warehouseQty, 40);
    assert.equal(result.next.shopQty, 20);
    assert.equal(result.next.onlineQty, 10);
    assert.equal(result.newTotal, 70);
  });

  test("chained: add 5 shop then remove 10 warehouse ends at 75 total", () => {
    const afterAdd = applyStockAdd(qtys(), "shop", 5);
    const afterDeduct = applyStockDeduction(afterAdd.next, "warehouse", 10);
    assert.equal(afterDeduct.newTotal, 75);
    assert.equal(afterDeduct.next.warehouseQty, 40);
    assert.equal(afterDeduct.next.shopQty, 25);
    assert.equal(afterDeduct.next.onlineQty, 10);
  });
});

describe("stock-math.ts — applyStockAdd", () => {
  test("adds only to the target location, total increases by the same amount", () => {
    const result = applyStockAdd(qtys(), "online", 15);
    assert.equal(result.next.onlineQty, 25);
    assert.equal(result.next.warehouseQty, 50);
    assert.equal(result.next.shopQty, 20);
    assert.equal(result.previousTotal, 80);
    assert.equal(result.newTotal, 95);
  });

  test("rejects zero/negative/non-finite quantity", () => {
    assert.throws(() => applyStockAdd(qtys(), "shop", 0), /above zero/i);
    assert.throws(() => applyStockAdd(qtys(), "shop", -5), /above zero/i);
    assert.throws(() => applyStockAdd(qtys(), "shop", NaN), /above zero/i);
    assert.throws(() => applyStockAdd(qtys(), "shop", Infinity), /above zero/i);
  });

  test("does not mutate the input", () => {
    const p = qtys();
    const before = { ...p };
    applyStockAdd(p, "shop", 3);
    assert.deepEqual(p, before);
  });
});

describe("stock-math.ts — applyStockMove", () => {
  test("move 10 warehouse -> shop: total unchanged, warehouse down, shop up", () => {
    const before = qtys();
    const result = applyStockMove(before, "warehouse", "shop", 10);
    assert.equal(result.next.warehouseQty, 40);
    assert.equal(result.next.shopQty, 30);
    assert.equal(result.next.onlineQty, 10);
    assert.equal(totalAcrossLocations(result.next), totalAcrossLocations(before));
    assert.equal(result.total, 80);
  });

  test("throws (plain Error, not InsufficientStockError) when from === to", () => {
    assert.throws(() => applyStockMove(qtys(), "shop", "shop", 5), /different locations/i);
  });

  test("Prompt 16 — moving more than source holds records in full, flags source, credits destination", () => {
    // warehouse(50) + shop(20) + online(10) = 80; shop only has 20
    const result = applyStockMove(qtys(), "shop", "online", 25);
    assert.equal(result.newFromQty, -5);
    assert.equal(result.newToQty, 35);
    assert.equal(result.neededRecount, true);
    assert.equal(result.next.warehouseQty, 50); // no borrow from warehouse
  });

  test("Prompt 16 — large move from online still credits shop in full", () => {
    const result = applyStockMove(qtys(), "online", "shop", 999);
    assert.equal(result.previousFromQty, 10);
    assert.equal(result.newFromQty, 10 - 999);
    assert.equal(result.newToQty, 20 + 999);
    assert.equal(result.neededRecount, true);
  });

  test("rejects zero/negative/non-finite quantity", () => {
    assert.throws(() => applyStockMove(qtys(), "warehouse", "shop", 0), /above zero/i);
    assert.throws(() => applyStockMove(qtys(), "warehouse", "shop", -1), /above zero/i);
    assert.throws(() => applyStockMove(qtys(), "warehouse", "shop", NaN), /above zero/i);
  });

  test("does not mutate the input", () => {
    const p = qtys();
    const before = { ...p };
    applyStockMove(p, "warehouse", "shop", 10);
    assert.deepEqual(p, before);
  });
});

describe("stock-math.ts — applyStockCorrection (absolute recount, never 'insufficient stock')", () => {
  test("sets the exact count at one location, leaves the others untouched", () => {
    const result = applyStockCorrection(qtys(), "shop", 3);
    assert.equal(result.next.shopQty, 3);
    assert.equal(result.next.warehouseQty, 50);
    assert.equal(result.next.onlineQty, 10);
    assert.equal(result.previousLocationQty, 20);
    assert.equal(result.previousTotal, 80);
    assert.equal(result.newTotal, 63);
  });

  test("correcting UP (recount found more stock than recorded) is allowed", () => {
    const result = applyStockCorrection(qtys(), "warehouse", 200);
    assert.equal(result.next.warehouseQty, 200);
    assert.equal(result.newTotal, 230);
  });

  test("correcting to exactly 0 is allowed (not an error)", () => {
    const result = applyStockCorrection(qtys(), "online", 0);
    assert.equal(result.next.onlineQty, 0);
  });

  test("rejects a negative count", () => {
    assert.throws(() => applyStockCorrection(qtys(), "shop", -1), /zero or more/i);
  });

  test("rejects a non-finite count", () => {
    assert.throws(() => applyStockCorrection(qtys(), "shop", NaN), /zero or more/i);
  });

  test("floors a fractional count (whole pieces only)", () => {
    const result = applyStockCorrection(qtys(), "shop", 7.9);
    assert.equal(result.next.shopQty, 7);
  });

  test("does not mutate the input", () => {
    const p = qtys();
    const before = { ...p };
    applyStockCorrection(p, "shop", 1);
    assert.deepEqual(p, before);
  });
});

describe("Prompt 16 Part A — oversell is recorded (recordSale path)", () => {
  test("applyStockDeduction records in full when quantity exceeds available and flags neededRecount", () => {
    const before = qtys();
    const result = applyStockDeduction(before, "shop", 999);
    assert.equal(result.previousLocationQty, 20);
    assert.equal(result.newLocationQty, 20 - 999);
    assert.equal(result.neededRecount, true);
    // Input object is never mutated.
    assert.deepEqual(before, qtys());
  });
});

describe("Prompt 15 — simultaneous changes (sequential application on the same base, documenting Firestore's job)", () => {
  // Firestore transactions serialize concurrent writers for us (one wins, the
  // other automatically retries against the post-write document) — that part
  // is infrastructure, not application pure logic, so it isn't re-tested
  // here. What IS testable without Firestore is that applying two updates
  // one after another (which is what a retried transaction looks like from
  // the pure-math layer's point of view) composes correctly and never loses
  // or double-counts a unit.
  test("two sequential sales against the same starting stock end at the correct final total", () => {
    const base = qtys(); // 80 total
    const firstSale = applyStockDeduction(base, "shop", 5); // simulates actor A's transaction winning first
    const secondSale = applyStockDeduction(firstSale.next, "shop", 5); // actor B's transaction retries against A's result
    assert.equal(secondSale.next.shopQty, 10);
    assert.equal(secondSale.newTotal, 70);
  });

  test("a sale followed by a restock followed by a move all compose correctly from the same base", () => {
    const base = qtys(); // 80 total
    const afterSale = applyStockDeduction(base, "online", 4); // 76 total
    const afterAdd = applyStockAdd(afterSale.next, "warehouse", 20); // 96 total
    const afterMove = applyStockMove(afterAdd.next, "warehouse", "shop", 30);
    assert.equal(totalAcrossLocations(afterMove.next), 96, "a move must never change the running total");
    assert.equal(afterMove.next.warehouseQty, 40);
    assert.equal(afterMove.next.shopQty, 50);
    assert.equal(afterMove.next.onlineQty, 6);
  });
});

describe("lib/idempotency.ts — withIdempotency (in-memory fake store, no Firestore)", () => {
  function fakeStore(): IdempotencyStore & { calls: number } {
    const data = new Map<string, { createdAt: string; result: unknown }>();
    return {
      calls: 0,
      async get(key) {
        return data.get(key) ?? null;
      },
      async set(key, record) {
        data.set(key, record);
      },
    };
  }

  test("the SAME key submitted twice applies the mutation exactly once — second call returns the cached result", async () => {
    const store = fakeStore();
    let applyCount = 0;
    const run = async () => {
      applyCount += 1;
      return { total: 85 };
    };

    const first = await withIdempotency(store, "key-1", run);
    const second = await withIdempotency(store, "key-1", run);

    assert.equal(applyCount, 1, "run() must only execute once for the same key");
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.result, first.result);
  });

  test("DIFFERENT keys each apply independently", async () => {
    const store = fakeStore();
    let applyCount = 0;
    const run = async () => {
      applyCount += 1;
      return { applyCount };
    };

    await withIdempotency(store, "key-a", run);
    await withIdempotency(store, "key-b", run);

    assert.equal(applyCount, 2);
  });

  test("a missing/blank key is rejected before run() is ever called", async () => {
    const store = fakeStore();
    let called = false;
    await assert.rejects(() => withIdempotency(store, "", async () => (called = true)));
    assert.equal(called, false);
  });

  test("an EXPIRED key (older than 24h) is treated as fresh — run() executes again", async () => {
    const store = fakeStore();
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    await store.set("stale-key", { createdAt: new Date(twentyFiveHoursAgo).toISOString(), result: { total: 1 } });

    let applyCount = 0;
    const result = await withIdempotency(store, "stale-key", async () => {
      applyCount += 1;
      return { total: 2 };
    });

    assert.equal(applyCount, 1, "an expired key must not short-circuit the real mutation");
    assert.equal(result.replayed, false);
    assert.deepEqual(result.result, { total: 2 });
  });

  test("isIdempotencyRecordExpired: fresh timestamp is not expired, 24h+ old timestamp is", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const fresh = new Date(now - 60 * 1000).toISOString();
    const stale = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    assert.equal(isIdempotencyRecordExpired(fresh, now), false);
    assert.equal(isIdempotencyRecordExpired(stale, now), true);
  });

  test("isIdempotencyRecordExpired fails closed (treated as expired) on garbage input", () => {
    assert.equal(isIdempotencyRecordExpired("not-a-date"), true);
    assert.equal(isIdempotencyRecordExpired(""), true);
  });
});

describe("Prompt 15 — zero/negative/non-numeric quantities are rejected across add/deduct/move", () => {
  const badQuantities = [0, -1, -0.5, NaN, Infinity, -Infinity];

  for (const bad of badQuantities) {
    test(`applyStockAdd rejects ${bad}`, () => {
      assert.throws(() => applyStockAdd(qtys(), "shop", bad));
    });
    test(`applyStockDeduction rejects ${bad}`, () => {
      assert.throws(() => applyStockDeduction(qtys(), "shop", bad));
    });
    test(`applyStockMove rejects ${bad}`, () => {
      assert.throws(() => applyStockMove(qtys(), "warehouse", "shop", bad));
    });
  }

  // "non-numeric" at the API boundary arrives as NaN once `Number(body.quantity)`
  // is applied to a non-numeric string — exercised directly here.
  test("Number('abc') produces NaN, which every mutator rejects", () => {
    const parsed = Number("abc");
    assert.ok(Number.isNaN(parsed));
    assert.throws(() => applyStockAdd(qtys(), "shop", parsed));
  });
});

describe("Prompt 15 — permission matrix: staff roles vs. correct/edit/archive", () => {
  const STAFF_ROLES: AccessRole[] = ["staff_view", "staff_add", "staff_sell", "staff_move"];

  test("staff_view cannot addStock, recordSale, moveStock, correctCount, editProduct, or archiveProduct/restoreProduct", () => {
    for (const action of ["addStock", "recordSale", "moveStock", "correctCount", "editProduct", "archiveProduct", "restoreProduct"]) {
      assert.equal(allowedStockAction("staff_view", action), false, `staff_view must not be allowed to ${action}`);
    }
  });

  test("staff_add / staff_sell / staff_move each get only their own stock action", () => {
    assert.equal(allowedStockAction("staff_add", "addStock"), true);
    assert.equal(allowedStockAction("staff_add", "recordSale"), false);
    assert.equal(allowedStockAction("staff_add", "moveStock"), false);
    assert.equal(allowedStockAction("staff_sell", "recordSale"), true);
    assert.equal(allowedStockAction("staff_sell", "addStock"), false);
    assert.equal(allowedStockAction("staff_sell", "moveStock"), false);
    assert.equal(allowedStockAction("staff_move", "moveStock"), true);
    assert.equal(allowedStockAction("staff_move", "addStock"), false);
    assert.equal(allowedStockAction("staff_move", "recordSale"), false);
    for (const role of ["staff_add", "staff_sell", "staff_move"] as const) {
      for (const action of ["correctCount", "editProduct", "archiveProduct", "restoreProduct"]) {
        assert.equal(allowedStockAction(role, action), false, `${role} must not be allowed to ${action}`);
      }
    }
  });

  test("both owner tiers (equal_owner, co_owner) may do all seven stock-accuracy actions", () => {
    for (const role of ["equal_owner", "co_owner"] as const) {
      for (const action of [
        "addStock",
        "recordSale",
        "moveStock",
        "correctCount",
        "editProduct",
        "archiveProduct",
        "restoreProduct",
      ]) {
        assert.equal(allowedStockAction(role, action), true, `${role} must be allowed to ${action}`);
      }
    }
  });

  test("neither staff role can ever do anything owner-only, for every action name used in this prompt", () => {
    for (const role of STAFF_ROLES) {
      assert.equal(allowedStockAction(role, "correctCount"), false);
      assert.equal(allowedStockAction(role, "editProduct"), false);
      assert.equal(allowedStockAction(role, "archiveProduct"), false);
      assert.equal(allowedStockAction(role, "restoreProduct"), false);
    }
  });
});
