import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyStockDeduction,
  qtyAtLocation,
  totalAcrossLocations,
  type LocationQtys,
} from "@/lib/stock-math";

function qtys(overrides: Partial<LocationQtys> = {}): LocationQtys {
  return { warehouseQty: 10, shopQty: 5, onlineQty: 3, ...overrides };
}

describe("stock-math.ts — totalAcrossLocations", () => {
  test("sums warehouse + shop + online", () => {
    assert.equal(totalAcrossLocations(qtys()), 18);
  });

  test("handles all-zero product", () => {
    assert.equal(totalAcrossLocations(qtys({ warehouseQty: 0, shopQty: 0, onlineQty: 0 })), 0);
  });
});

describe("stock-math.ts — qtyAtLocation", () => {
  test("reads warehouse/shop/online independently", () => {
    const p = qtys();
    assert.equal(qtyAtLocation(p, "warehouse"), 10);
    assert.equal(qtyAtLocation(p, "shop"), 5);
    assert.equal(qtyAtLocation(p, "online"), 3);
  });
});

describe("stock-math.ts — applyStockDeduction", () => {
  test("deducts only the warehouse location, leaves shop/online untouched", () => {
    const result = applyStockDeduction(qtys(), "warehouse", 4);
    assert.equal(result.next.warehouseQty, 6);
    assert.equal(result.next.shopQty, 5);
    assert.equal(result.next.onlineQty, 3);
    assert.equal(result.previousLocationQty, 10);
    assert.equal(result.newLocationQty, 6);
  });

  test("deducts only the shop location, leaves warehouse/online untouched", () => {
    const result = applyStockDeduction(qtys(), "shop", 5);
    assert.equal(result.next.warehouseQty, 10);
    assert.equal(result.next.shopQty, 0);
    assert.equal(result.next.onlineQty, 3);
  });

  test("deducts only the online location, leaves warehouse/shop untouched", () => {
    const result = applyStockDeduction(qtys(), "online", 3);
    assert.equal(result.next.warehouseQty, 10);
    assert.equal(result.next.shopQty, 5);
    assert.equal(result.next.onlineQty, 0);
  });

  test("total recalculates as the sum of the three new quantities (never stored independently)", () => {
    const result = applyStockDeduction(qtys(), "shop", 2);
    assert.equal(result.previousTotal, 18);
    assert.equal(result.newTotal, totalAcrossLocations(result.next));
    assert.equal(result.newTotal, 16);
  });

  test("allows deducting the exact remaining quantity (boundary: locationQty becomes 0)", () => {
    const result = applyStockDeduction(qtys(), "online", 3);
    assert.equal(result.newLocationQty, 0);
    assert.equal(result.newTotal, 15);
  });

  test("Prompt 16 — overselling is recorded in full and flags neededRecount (no borrow)", () => {
    const result = applyStockDeduction(qtys(), "shop", 6);
    assert.equal(result.previousLocationQty, 5);
    assert.equal(result.newLocationQty, -1);
    assert.equal(result.neededRecount, true);
    // Other locations untouched — no borrow.
    assert.equal(result.next.warehouseQty, 10);
    assert.equal(result.next.onlineQty, 3);
  });

  test("Prompt 16 — overselling does not borrow from other locations even when combined stock is enough", () => {
    const result = applyStockDeduction(qtys(), "shop", 10);
    assert.equal(result.next.shopQty, -5);
    assert.equal(result.next.warehouseQty, 10);
    assert.equal(result.next.onlineQty, 3);
    assert.equal(result.neededRecount, true);
  });

  test("rejects zero quantity", () => {
    assert.throws(() => applyStockDeduction(qtys(), "warehouse", 0), /above zero/i);
  });

  test("rejects negative quantity", () => {
    assert.throws(() => applyStockDeduction(qtys(), "warehouse", -1), /above zero/i);
  });

  test("rejects non-finite quantity (NaN/Infinity)", () => {
    assert.throws(() => applyStockDeduction(qtys(), "warehouse", NaN), /above zero/i);
    assert.throws(() => applyStockDeduction(qtys(), "warehouse", Infinity), /above zero/i);
  });

  test("does not mutate the input product object", () => {
    const p = qtys();
    const before = { ...p };
    applyStockDeduction(p, "warehouse", 1);
    assert.deepEqual(p, before);
  });
});
