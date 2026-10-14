import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyAddPlace,
  applyAddWarehouse,
  applyRemovePlace,
  applyRemoveWarehouse,
  applyRenameWarehouse,
  canRemovePlace,
  canRemoveWarehouse,
  DEFAULT_PLACES,
  normalizePlaces,
  placeHasNoStock,
} from "@/lib/places";
import {
  applyStockMove,
  displayTotalAcrossLocations,
  locationNeedsRecount,
  withRecountFlag,
} from "@/lib/stock-math";
import type { Product } from "@/lib/types";

describe("Multiple warehouses — places helpers", () => {
  test("defaults include one warehouse, shop, and online", () => {
    const places = normalizePlaces(null);
    assert.equal(places.filter((p) => p.kind === "warehouse").length, 1);
    assert.ok(places.some((p) => p.id === "shop"));
    assert.ok(places.some((p) => p.id === "online"));
  });

  test("cannot remove the last warehouse, shop, or online store", () => {
    const places = DEFAULT_PLACES.map((p) => ({ ...p }));
    assert.equal(canRemoveWarehouse(places, "warehouse").ok, false);
    assert.equal(canRemovePlace(places, "shop").ok, false);
    assert.equal(canRemovePlace(places, "online").ok, false);
  });

  test("can add and rename a second warehouse, then remove it when empty", () => {
    let places = applyAddWarehouse(DEFAULT_PLACES, "Lahore warehouse", "wh-lahore");
    assert.equal(places.filter((p) => p.kind === "warehouse").length, 2);
    places = applyRenameWarehouse(places, "wh-lahore", "Karachi warehouse");
    assert.equal(places.find((p) => p.id === "wh-lahore")?.name, "Karachi warehouse");
    places = applyRemoveWarehouse(places, "wh-lahore");
    assert.equal(places.filter((p) => p.kind === "warehouse").length, 1);
  });

  test("can add multiple shops and online stores", () => {
    let places = applyAddPlace(DEFAULT_PLACES, "shop", "Branch shop", "shop-branch");
    places = applyAddPlace(places, "online", "Shopify", "online-shopify");
    assert.equal(places.filter((p) => p.kind === "shop").length, 2);
    assert.equal(places.filter((p) => p.kind === "online").length, 2);
    places = applyRemovePlace(places, "shop-branch");
    places = applyRemovePlace(places, "online-shopify");
    assert.equal(places.filter((p) => p.kind === "shop").length, 1);
    assert.equal(places.filter((p) => p.kind === "online").length, 1);
  });

  test("normalizePlaces keeps every shop and online store", () => {
    const places = normalizePlaces([
      { id: "warehouse", name: "Warehouse", kind: "warehouse" },
      { id: "shop", name: "Shop A", kind: "shop" },
      { id: "shop-b", name: "Shop B", kind: "shop" },
      { id: "online", name: "Site", kind: "online" },
      { id: "online-mkt", name: "Marketplace", kind: "online" },
    ]);
    assert.equal(places.filter((p) => p.kind === "shop").length, 2);
    assert.equal(places.filter((p) => p.kind === "online").length, 2);
  });

  test("placeHasNoStock blocks remove when a product still holds stock there", () => {
    const products = [
      {
        stockByPlace: { warehouse: 0, shop: 0, online: 0, "wh-2": 4 },
        warehouseQty: 0,
        shopQty: 0,
        onlineQty: 0,
      },
    ] as unknown as Product[];
    assert.equal(placeHasNoStock(products, "wh-2"), false);
    assert.equal(placeHasNoStock(products, "warehouse"), true);
  });
});

describe("Multiple warehouses — stock math across warehouse places", () => {
  test("move between two warehouses keeps grand total and can flag recount on source", () => {
    const start = {
      stockByPlace: { warehouse: 10, "wh-2": 0, shop: 2, online: 1 },
      warehouseQty: 10,
      shopQty: 2,
      onlineQty: 1,
    };
    const moved = applyStockMove(start, "warehouse", "wh-2", 4);
    assert.equal(moved.next.stockByPlace.warehouse, 6);
    assert.equal(moved.next.stockByPlace["wh-2"], 4);
    assert.equal(moved.total, 13);
    assert.equal(moved.neededRecount, false);

    const oversell = applyStockMove(start, "warehouse", "wh-2", 20);
    assert.equal(oversell.neededRecount, true);
    assert.equal(oversell.newFromQty, -10);
    assert.equal(oversell.newToQty, 20);
    const flags = withRecountFlag({}, "warehouse", true);
    assert.equal(locationNeedsRecount({ ...oversell.next, ...flags }, "warehouse"), true);
  });

  test("display total sums every place including extra warehouses", () => {
    const total = displayTotalAcrossLocations({
      stockByPlace: { warehouse: 5, "wh-2": 7, shop: 1, online: -3 },
      warehouseQty: 5,
      shopQty: 1,
      onlineQty: -3,
    });
    // online displays as 0
    assert.equal(total, 5 + 7 + 1 + 0);
  });
});
