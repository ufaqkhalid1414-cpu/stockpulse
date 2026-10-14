import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyStockCorrection,
  applyStockDeduction,
  applyStockMove,
  countProductsNeedingRecount,
  displayQty,
  displayTotalAcrossLocations,
  locationNeedsRecount,
  productNeedsRecount,
} from "@/lib/stock-math";
import { stockValue } from "@/lib/metrics";
import type { Product } from "@/lib/types";

function qtys(w = 3, s = 0, o = 0) {
  return { warehouseQty: w, shopQty: s, onlineQty: o };
}

describe("Prompt 16 Part A — sales always record; recount flag", () => {
  test("sale of 10 when app holds 3 is recorded in full and needs recount", () => {
    const result = applyStockDeduction(qtys(3), "warehouse", 10);
    assert.equal(result.newLocationQty, -7);
    assert.equal(result.neededRecount, true);
    assert.equal(displayQty(result.newLocationQty), 0);
  });

  test("display never shows a minus sign", () => {
    assert.equal(displayQty(-7), 0);
    assert.equal(displayQty(0), 0);
    assert.equal(displayQty(4), 4);
    assert.equal(displayTotalAcrossLocations({ warehouseQty: -7, shopQty: 2, onlineQty: -1 }), 2);
  });

  test("move larger than source flags source and credits destination in full", () => {
    const result = applyStockMove(qtys(3, 1, 0), "warehouse", "shop", 10);
    assert.equal(result.newFromQty, -7);
    assert.equal(result.newToQty, 11);
    assert.equal(result.neededRecount, true);
  });

  test("correct count never sets a negative and clears the need for display", () => {
    const afterSale = applyStockDeduction(qtys(3), "shop", 5);
    const corrected = applyStockCorrection(afterSale.next, "shop", 4);
    assert.equal(corrected.newLocationQty, 4);
    assert.ok(corrected.newLocationQty >= 0);
  });

  test("stock value treats a flagged/negative location as 0", () => {
    const product = {
      id: "p1",
      name: "Biscuits",
      category: "Snacks",
      variant: "",
      warehouseQty: -7,
      shopQty: 2,
      onlineQty: 0,
      purchasePrice: 100,
      restockThreshold: 1,
      piecesPerCarton: null,
      priceCompareUnit: "piece" as const,
      priceEntries: [],
      priceHistory: [],
      needsRecountWarehouse: true,
    } satisfies Product;
    // Displayed: warehouse 0 + shop 2 + online 0 = 2 * 100
    assert.equal(stockValue([product]), 200);
  });

  test("productNeedsRecount counts locations with flag or negative raw qty", () => {
    const flagged = {
      ...qtys(-1, 0, 0),
      needsRecountWarehouse: true,
      needsRecountShop: false,
      needsRecountOnline: false,
    };
    assert.equal(locationNeedsRecount(flagged, "warehouse"), true);
    assert.equal(productNeedsRecount(flagged), true);
    assert.equal(countProductsNeedingRecount([flagged, qtys(5, 5, 5)]), 1);
  });
});
