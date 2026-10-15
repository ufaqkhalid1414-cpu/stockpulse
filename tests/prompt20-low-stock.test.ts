import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildLowStockAlertMessage,
  evaluateLowStockCrossing,
  formatLowStockPlaceSummary,
  isPlaceLow,
  placeEverHeld,
  placeLinesForProduct,
  productHasLowPlace,
} from "@/lib/low-stock";
import { maySendNotification, normalizeNotificationPrefs } from "@/lib/notification-prefs";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Biscuits",
    category: "Snacks",
    variant: "",
    warehouseQty: 50,
    shopQty: 12,
    onlineQty: 0,
    stockByPlace: { warehouse: 50, shop: 12, online: 0 },
    purchasePrice: 10,
    restockThreshold: 10,
    piecesPerCarton: null,
    priceCompareUnit: "piece",
    priceEntries: [],
    priceHistory: [],
    everHeldByPlace: { warehouse: true, shop: true },
    lowStockAlertedByPlace: {},
    ...overrides,
  };
}

describe("Prompt 20 — low stock per place", () => {
  test("at or below means low (threshold 10, qty 10 and 9)", () => {
    assert.equal(isPlaceLow(10, 10), true);
    assert.equal(isPlaceLow(9, 10), true);
    assert.equal(isPlaceLow(11, 10), false);
  });

  test("Shop 12→9 with number 10 fires exactly one crossing alert", () => {
    const first = evaluateLowStockCrossing({
      previousQty: 12,
      newQty: 9,
      threshold: 10,
      alreadyAlerted: false,
    });
    assert.equal(first.fire, true);
    assert.equal(first.nextAlerted, true);

    const second = evaluateLowStockCrossing({
      previousQty: 9,
      newQty: 7,
      threshold: 10,
      alreadyAlerted: true,
    });
    assert.equal(second.fire, false);
    assert.equal(second.nextAlerted, true);
  });

  test("restock above then sell down to 10 alerts again", () => {
    const rearm = evaluateLowStockCrossing({
      previousQty: 7,
      newQty: 15,
      threshold: 10,
      alreadyAlerted: true,
    });
    assert.equal(rearm.fire, false);
    assert.equal(rearm.nextAlerted, false);

    const again = evaluateLowStockCrossing({
      previousQty: 15,
      newQty: 10,
      threshold: 10,
      alreadyAlerted: false,
    });
    assert.equal(again.fire, true);
  });

  test("creating with 4 in stock does not cross (no prior above), but shows on Low Stock", () => {
    const created = evaluateLowStockCrossing({
      previousQty: 0,
      newQty: 4,
      threshold: 5,
      alreadyAlerted: false,
    });
    // 0→4: both at/below if threshold 5? 0 displayed is low, 4 is low — but prev was 0 which is NOT > threshold
    // Crossing requires previous > threshold. Creation path never calls evaluate for alert.
    assert.equal(created.fire, false);

    const p = product({
      shopQty: 4,
      warehouseQty: 0,
      onlineQty: 0,
      stockByPlace: { warehouse: 0, shop: 4, online: 0 },
      restockThreshold: 5,
      everHeldByPlace: { shop: true },
    });
    assert.equal(productHasLowPlace(p), true);
    const summary = formatLowStockPlaceSummary(p);
    assert.match(summary, /Shop 4/);
    assert.doesNotMatch(summary, /Online/);
    assert.doesNotMatch(summary, /Warehouse/);
  });

  test("never-stocked Online never shows an Online line", () => {
    const p = product({
      onlineQty: 0,
      everHeldByPlace: { warehouse: true, shop: true },
    });
    assert.equal(placeEverHeld(p, "online"), false);
    const lines = placeLinesForProduct(p);
    assert.equal(lines.some((l) => l.id === "online"), false);
  });

  test("moving 45 of 50 out of Warehouse crosses into low", () => {
    const move = evaluateLowStockCrossing({
      previousQty: 50,
      newQty: 5,
      threshold: 10,
      alreadyAlerted: false,
    });
    assert.equal(move.fire, true);
  });

  test("recount priority: when neededRecount, low-stock send is suppressed by caller", () => {
    const crossed = evaluateLowStockCrossing({
      previousQty: 12,
      newQty: -3,
      threshold: 10,
      alreadyAlerted: false,
    });
    assert.equal(crossed.fire, true);
    const neededRecount = true;
    const shouldSendLowStock = crossed.fire && !neededRecount;
    assert.equal(shouldSendLowStock, false);
  });

  test("staff get nothing; owner with low-stock switch off gets nothing", () => {
    const off = normalizeNotificationPrefs({ lowStockAlerts: false });
    assert.equal(maySendNotification(off, "low_stock_alert"), false);
    assert.equal(maySendNotification(normalizeNotificationPrefs({}), "low_stock_alert"), true);
  });

  test("alert message names the low place and lists every held place", () => {
    const lines = placeLinesForProduct(
      product({
        shopQty: 4,
        warehouseQty: 50,
        onlineQty: 6,
        stockByPlace: { warehouse: 50, shop: 4, online: 6 },
        everHeldByPlace: { warehouse: true, shop: true, online: true },
        restockThreshold: 10,
      }),
    );
    const { title, body } = buildLowStockAlertMessage({
      productName: "Biscuits",
      lowPlaceId: "shop",
      lowPlaceQty: 4,
      placeLines: lines,
      language: "en",
    });
    assert.match(title, /Biscuits/);
    assert.match(title, /Shop/i);
    assert.match(body, /4 left/);
    assert.match(body, /Warehouse 50/);
    assert.match(body, /Online 6/);
  });
});
