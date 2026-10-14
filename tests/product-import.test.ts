import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildImportTemplateCsv,
  importContentKey,
  parseCsvText,
  previewImportRows,
  rowsFromCsvMatrix,
} from "@/lib/product-import";
import { canImportProducts } from "@/lib/access";
import { allowedStockAction } from "@/lib/permissions";
import type { Product } from "@/lib/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    category: "Snacks",
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

describe("Prompt 17 — CSV import preview", () => {
  test("template downloads with headers and example rows", () => {
    const csv = buildImportTemplateCsv();
    assert.match(csv, /name,category,variant,location/);
    assert.match(csv, /Basmati Rice/);
    assert.match(csv, /Plain Biscuits/);
  });

  test("preview: 1000-ish rows with 3 bad rows reports correctly", () => {
    const header = "name,category,variant,location,quantity,price,price_unit,pieces_per_carton,low_stock_threshold";
    const good = Array.from({ length: 997 }, (_, i) =>
      `Item ${i},Cat,,Warehouse,1,10,piece,,5`,
    );
    const bad = [
      "Bad Qty,Cat,,Warehouse,abc,10,piece,,",
      "Bad Loc,Cat,,Moon,1,10,piece,,",
      ",Cat,,Shop,1,10,piece,,",
    ];
    const text = [header, ...good, ...bad].join("\n");
    const rows = rowsFromCsvMatrix(parseCsvText(text));
    assert.equal(rows.length, 1000);
    const preview = previewImportRows(rows, []);
    assert.equal(preview.ready.length, 997);
    assert.equal(preview.problems.length, 3);
    assert.ok(preview.problems.some((p) => /quantity must be a number/i.test(p.message)));
  });

  test("existing products are separated for skip/add choice", () => {
    const existing = [product({ id: "p1", name: "Plain Biscuits", variant: "family pack" })];
    const text = [
      "name,category,variant,location,quantity,price,price_unit,pieces_per_carton,low_stock_threshold",
      "Plain Biscuits,Snacks,family pack,Shop,2,100,piece,,",
      "New Thing,Snacks,,Warehouse,1,50,piece,,",
    ].join("\n");
    const preview = previewImportRows(rowsFromCsvMatrix(parseCsvText(text)), existing);
    assert.equal(preview.existing.length, 1);
    assert.equal(preview.ready.length, 1);
    assert.equal(preview.existing[0].existingProductId, "p1");
  });

  test("same file content key is stable (re-upload duplicate guard)", () => {
    const rows = [
      {
        rowNumber: 2,
        name: "A",
        category: "C",
        variant: "",
        location: "warehouse" as const,
        quantity: 1,
        purchasePrice: 10,
        piecesPerCarton: null,
        restockThreshold: undefined,
        existingProductId: null,
      },
    ];
    assert.equal(importContentKey(rows, "skip"), importContentKey(rows, "skip"));
    assert.notEqual(importContentKey(rows, "skip"), importContentKey(rows, "add"));
  });

  test("staff cannot import — server permission matrix", () => {
    assert.equal(canImportProducts("staff_add"), false);
    assert.equal(canImportProducts("staff_view"), false);
    assert.equal(canImportProducts("equal_owner"), true);
    assert.equal(canImportProducts("co_owner"), true);
    assert.equal(allowedStockAction("staff_add", "importProducts"), false);
    assert.equal(allowedStockAction("equal_owner", "importProducts"), true);
  });
});
