import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { canAddProduct } from "@/lib/access";
import { isValidPurchasePrice, parseRequiredPurchasePrice } from "@/lib/price-math";
import { allowedStockAction } from "@/lib/permissions";
import { totalAcrossLocations } from "@/lib/stock-math";
import type { Product } from "@/lib/types";

describe("Prompt 24 — purchase price required for new products", () => {
  test("valid purchase price is accepted", () => {
    assert.equal(isValidPurchasePrice(10), true);
    assert.equal(isValidPurchasePrice(0.01), true);
    assert.equal(parseRequiredPurchasePrice(12.5), 12.5);
    assert.equal(parseRequiredPurchasePrice("99"), 99);
  });

  test("empty / missing purchase price is rejected", () => {
    assert.equal(parseRequiredPurchasePrice(undefined), null);
    assert.equal(parseRequiredPurchasePrice(null), null);
    assert.equal(parseRequiredPurchasePrice(""), null);
    assert.equal(parseRequiredPurchasePrice("   "), null);
    assert.equal(isValidPurchasePrice(Number("")), false);
  });

  test("invalid, non-finite, zero, and negative values are rejected", () => {
    for (const bad of [0, -1, -0.01, NaN, Infinity, -Infinity, Number("abc")]) {
      assert.equal(isValidPurchasePrice(bad), false, String(bad));
      assert.equal(parseRequiredPurchasePrice(bad), null, String(bad));
    }
    assert.equal(parseRequiredPurchasePrice("abc"), null);
    assert.equal(parseRequiredPurchasePrice("-5"), null);
    assert.equal(parseRequiredPurchasePrice("0"), null);
  });

  test("addProduct API path enforces parseRequiredPurchasePrice (cannot bypass via direct body)", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/stock/route.ts"), "utf8");
    assert.match(route, /parseRequiredPurchasePrice\(body\.purchasePrice\)/);
    assert.match(route, /Enter a price above zero/);
    const queries = readFileSync(path.join(process.cwd(), "lib/db/queries.ts"), "utf8");
    assert.match(queries, /isValidPurchasePrice\(input\.purchasePrice\)/);
  });

  test("editProduct does not require purchase price (legacy products stay editable)", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/stock/route.ts"), "utf8");
    const editBlock = route.slice(route.indexOf('action === "editProduct"'), route.indexOf('action === "setPriceCompareUnit"'));
    assert.ok(editBlock.length > 0);
    assert.doesNotMatch(editBlock, /parseRequiredPurchasePrice|purchasePrice/);
  });

  test("Add Product UI still validates empty/invalid price and marks field required", () => {
    const page = readFileSync(path.join(process.cwd(), "app/add-product/page.tsx"), "utf8");
    assert.match(page, /priceInvalid/);
    assert.match(page, /price\.trim\(\) === ""/);
    assert.match(page, /required/);
  });

  test("staff permissions for addProduct unchanged", () => {
    assert.equal(canAddProduct("equal_owner"), true);
    assert.equal(canAddProduct("co_owner"), true);
    assert.equal(canAddProduct("staff_add"), true);
    assert.equal(canAddProduct("staff_view"), false);
    assert.equal(allowedStockAction("staff_add", "addProduct"), true);
    assert.equal(allowedStockAction("staff_view", "addProduct"), false);
  });

  test("stock totals and existing purchase prices are unaffected by validation helpers", () => {
    const product = {
      warehouseQty: 50,
      shopQty: 20,
      onlineQty: 10,
      purchasePrice: 7.5,
    } as Product;
    assert.equal(totalAcrossLocations(product), 80);
    assert.equal(product.purchasePrice, 7.5);
    // Helpers are pure — do not mutate product fields.
    assert.equal(parseRequiredPurchasePrice(product.purchasePrice), 7.5);
    assert.equal(product.purchasePrice, 7.5);
  });
});
