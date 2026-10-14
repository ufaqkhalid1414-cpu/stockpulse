import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { purchasePriceChangePct, shouldAlertOnPurchasePriceChange } from "@/lib/price-math";

describe("price-math.ts — purchasePriceChangePct", () => {
  test("positive change (price jumped)", () => {
    assert.equal(purchasePriceChangePct(100, 110), 10);
  });

  test("negative change (price dropped)", () => {
    assert.equal(purchasePriceChangePct(100, 90), -10);
  });

  test("no change", () => {
    assert.equal(purchasePriceChangePct(100, 100), 0);
  });

  test("zero previous price does not divide by zero — returns 0", () => {
    assert.equal(purchasePriceChangePct(0, 50), 0);
  });

  test("non-finite inputs return 0 instead of NaN", () => {
    assert.equal(purchasePriceChangePct(NaN, 50), 0);
    assert.equal(purchasePriceChangePct(100, NaN), 0);
  });
});

describe("price-math.ts — shouldAlertOnPurchasePriceChange (threshold boundary cases)", () => {
  test("exactly at threshold → alerts (inclusive >=, matches recordPurchasePrice)", () => {
    // 2400 -> 2640 is exactly +10%
    assert.equal(shouldAlertOnPurchasePriceChange(2400, 2640, 10), true);
  });

  test("just under threshold → does not alert", () => {
    // 2400 -> 2639 is +9.958...%
    assert.equal(shouldAlertOnPurchasePriceChange(2400, 2639, 10), false);
  });

  test("just over threshold → alerts", () => {
    assert.equal(shouldAlertOnPurchasePriceChange(2400, 2641, 10), true);
  });

  test("drop exactly at threshold also alerts (abs value, inclusive)", () => {
    // 2400 -> 2160 is exactly -10%
    assert.equal(shouldAlertOnPurchasePriceChange(2400, 2160, 10), true);
  });

  test("drop just under threshold does not alert", () => {
    assert.equal(shouldAlertOnPurchasePriceChange(2400, 2161, 10), false);
  });

  test("zero threshold alerts on any nonzero change", () => {
    assert.equal(shouldAlertOnPurchasePriceChange(100, 100.01, 0), true);
    assert.equal(shouldAlertOnPurchasePriceChange(100, 100, 0), true); // |0| >= 0
  });

  test("zero/invalid baseline never alerts (guards against divide-by-zero)", () => {
    assert.equal(shouldAlertOnPurchasePriceChange(0, 500, 10), false);
    assert.equal(shouldAlertOnPurchasePriceChange(-5, 500, 10), false);
  });

  test("no price change never alerts (unless threshold is 0)", () => {
    assert.equal(shouldAlertOnPurchasePriceChange(1000, 1000, 10), false);
  });
});
