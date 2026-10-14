import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { entryPctChange, priceInUnit } from "@/lib/price-display";

describe("price-display", () => {
  test("priceInUnit converts piece → carton", () => {
    assert.equal(priceInUnit(10, "piece", 100), 10);
    assert.equal(priceInUnit(10, "carton", 100), 1000);
    assert.equal(priceInUnit(10, "carton", null), 10);
  });

  test("entryPctChange is unit-agnostic (per-piece only)", () => {
    assert.equal(entryPctChange({ pricePerPiece: 100 }, { pricePerPiece: 110 }), 10);
    assert.equal(entryPctChange({ pricePerPiece: 200 }, { pricePerPiece: 100 }), -50);
    assert.equal(entryPctChange({ pricePerPiece: 0 }, { pricePerPiece: 50 }), 0);
  });
});
