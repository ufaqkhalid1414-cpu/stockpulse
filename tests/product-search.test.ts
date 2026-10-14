import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  filterProducts,
  findExactProduct,
  findNameMatches,
  findSimilarProducts,
  normalizeProductText,
  productMatchesQuery,
} from "@/lib/product-search";
import type { Product } from "@/lib/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    category: "",
    variant: "",
    warehouseQty: 0,
    shopQty: 0,
    onlineQty: 0,
    purchasePrice: 1,
    restockThreshold: 5,
    piecesPerCarton: null,
    priceCompareUnit: "piece",
    priceEntries: [],
    priceHistory: [],
    ...partial,
  };
}

describe("Prompt 17 — product search", () => {
  test('"condition" finds "Hair Conditioner"', () => {
    const products = [
      product({ id: "1", name: "Hair Conditioner", category: "Personal care" }),
      product({ id: "2", name: "Basmati Rice", category: "Staples" }),
    ];
    assert.equal(productMatchesQuery(products[0], "condition"), true);
    const filtered = filterProducts(products, "condition", null);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "1");
  });

  test("Urdu name is found by an Urdu search", () => {
    const products = [product({ id: "1", name: "چاول", category: "اشیا" })];
    assert.equal(productMatchesQuery(products[0], "چاول"), true);
    assert.equal(filterProducts(products, "چاول", null).length, 1);
  });

  test("category filter narrows the list", () => {
    const products = [
      product({ id: "1", name: "Rice", category: "Staples" }),
      product({ id: "2", name: "Soap", category: "Personal care" }),
    ];
    const filtered = filterProducts(products, "", "Staples");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, "Rice");
  });

  test("exact duplicate match ignores case and spaces", () => {
    const products = [product({ id: "1", name: "Plain Biscuits", variant: "family pack" })];
    const hit = findExactProduct(products, "  plain   biscuits ", "Family Pack");
    assert.ok(hit);
    assert.equal(hit?.id, "1");
  });

  test("typing a name offers matching products for restock", () => {
    const products = [
      product({ id: "1", name: "Plain Biscuits", variant: "family pack" }),
      product({ id: "2", name: "Chocolate Biscuits" }),
    ];
    const matches = findNameMatches(products, "bisc");
    assert.ok(matches.length >= 1);
    assert.ok(matches.some((p) => p.name.includes("Biscuits")));
  });

  test("similar names surface a soft suggestion", () => {
    const products = [product({ id: "1", name: "Biscuits" })];
    const similar = findSimilarProducts(products, "Biscuitz");
    assert.equal(similar.length, 1);
    assert.equal(similar[0].id, "1");
  });

  test("normalize collapses punctuation and case", () => {
    assert.equal(normalizeProductText("  Hair-Conditioner!! "), "hair conditioner");
  });
});
