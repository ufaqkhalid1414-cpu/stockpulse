import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PAGE_SIZE,
  filterProducts,
  paginateProducts,
  productMatchesQuery,
} from "@/lib/product-search";
import type { Product } from "@/lib/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    category: "Grocery",
    variant: "",
    warehouseQty: 1,
    shopQty: 1,
    onlineQty: 0,
    purchasePrice: 10,
    restockThreshold: 5,
    piecesPerCarton: null,
    priceCompareUnit: "piece",
    priceEntries: [],
    priceHistory: [],
    ...partial,
  };
}

const inventory = [
  product({ id: "1", name: "Biscuits" }),
  product({ id: "2", name: "Chocolate Biscuits" }),
  product({ id: "3", name: "Milk" }),
  product({ id: "4", name: "Cooking Oil" }),
  product({ id: "5", name: "Rice" }),
];

describe("Prompt 22 — Items product search", () => {
  test("full product name returns the correct product", () => {
    const hits = filterProducts(inventory, "Milk", null);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, "Milk");
  });

  test('partial "bis" returns Biscuits and Chocolate Biscuits', () => {
    const hits = filterProducts(inventory, "bis", null);
    assert.equal(hits.length, 2);
    assert.ok(hits.every((p) => /biscuit/i.test(p.name)));
  });

  test("case-insensitive: milk / Milk / MILK", () => {
    for (const q of ["milk", "Milk", "MILK"]) {
      const hits = filterProducts(inventory, q, null);
      assert.equal(hits.length, 1, q);
      assert.equal(hits[0].id, "3");
    }
  });

  test("leading and trailing spaces still match", () => {
    assert.equal(productMatchesQuery(inventory[2], "  milk  "), true);
    assert.equal(filterProducts(inventory, "  bis  ", null).length, 2);
  });

  test("clearing the query restores the full list", () => {
    const filtered = filterProducts(inventory, "oil", null);
    assert.equal(filtered.length, 1);
    const restored = filterProducts(inventory, "", null);
    assert.equal(restored.length, inventory.length);
    const cleared = filterProducts(inventory, "   ", null);
    assert.equal(cleared.length, inventory.length);
  });

  test("no matches returns an empty list (UI shows no-results message)", () => {
    const hits = filterProducts(inventory, "toothpaste", null);
    assert.equal(hits.length, 0);
  });

  test("empty inventory stays empty", () => {
    assert.equal(filterProducts([], "milk", null).length, 0);
    assert.equal(filterProducts([], "", null).length, 0);
  });

  test("search works with category filter", () => {
    const mixed = [
      product({ id: "a", name: "Biscuits", category: "Snacks" }),
      product({ id: "b", name: "Chocolate Biscuits", category: "Snacks" }),
      product({ id: "c", name: "Biscuit Tin", category: "Household" }),
    ];
    const hits = filterProducts(mixed, "bisc", "Snacks");
    assert.equal(hits.length, 2);
    assert.ok(hits.every((p) => p.category === "Snacks"));
  });

  test("products beyond the first page are still findable (filter then paginate)", () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      product({ id: `p${i}`, name: i === PAGE_SIZE + 2 ? "Hidden Rice" : `Item ${i}` }),
    );
    const page1 = paginateProducts(many, 1);
    assert.equal(page1.some((p) => p.name === "Hidden Rice"), false);
    const hits = filterProducts(many, "Hidden Rice", null);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, "Hidden Rice");
  });

  test("searching does not mutate product quantities or prices", () => {
    const sample = product({ id: "x", name: "Milk", shopQty: 7, purchasePrice: 99 });
    const before = JSON.stringify(sample);
    filterProducts([sample], "mil", null);
    productMatchesQuery(sample, "MILK");
    assert.equal(JSON.stringify(sample), before);
    assert.equal(sample.shopQty, 7);
    assert.equal(sample.purchasePrice, 99);
  });

  test("tenant isolation: filtering one business list never includes another business's products", () => {
    const bizA = [product({ id: "a1", name: "Biz A Oil" })];
    const bizB = [product({ id: "b1", name: "Biz B Oil" })];
    const hitsA = filterProducts(bizA, "oil", null);
    assert.equal(hitsA.length, 1);
    assert.equal(hitsA[0].id, "a1");
    assert.equal(hitsA.some((p) => p.id === "b1"), false);
    // Caller only passes current business products (state.products) — same isolation model.
    assert.equal(filterProducts(bizB, "oil", null)[0].id, "b1");
  });
});
