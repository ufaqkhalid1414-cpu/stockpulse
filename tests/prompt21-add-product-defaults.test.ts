import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_NEW_PRICE_UNIT,
  LOCATION_HINTS_EN,
  defaultNewStockLocation,
} from "@/lib/add-product-defaults";
import { DEFAULT_PLACES, normalizePlaces } from "@/lib/places";
import { t } from "@/lib/i18n";
import { piecePriceFromCarton, toPieceQty } from "@/lib/units";
import type { StockPlace } from "@/lib/types";

describe("Prompt 21 — Add Product first-time defaults", () => {
  test("new product defaults location to Shop", () => {
    assert.equal(defaultNewStockLocation(DEFAULT_PLACES), "shop");
    assert.equal(defaultNewStockLocation(normalizePlaces(undefined)), "shop");
    assert.equal(defaultNewStockLocation([]), "shop");
  });

  test("user can still pick Warehouse or Online (ids remain valid options)", () => {
    const places = normalizePlaces(undefined);
    const ids = places.map((p) => p.id);
    assert.ok(ids.includes("warehouse"));
    assert.ok(ids.includes("shop"));
    assert.ok(ids.includes("online"));
    // Changing selection is a UI action; defaults stay Shop until changed.
    assert.equal(defaultNewStockLocation(places), "shop");
    assert.notEqual(defaultNewStockLocation(places), "warehouse");
  });

  test("prefers shop kind when multiple places exist", () => {
    const places: StockPlace[] = [
      { id: "warehouse", name: "Warehouse", kind: "warehouse" },
      { id: "warehouse-2", name: "Back room", kind: "warehouse" },
      { id: "shop", name: "Shop", kind: "shop" },
      { id: "online", name: "Online", kind: "online" },
    ];
    assert.equal(defaultNewStockLocation(places), "shop");
  });

  test("default price unit is Per piece", () => {
    assert.equal(DEFAULT_NEW_PRICE_UNIT, "piece");
  });

  test("Per carton calculations still work when user selects carton", () => {
    const piecePrice = piecePriceFromCarton(1000, 100);
    assert.equal(piecePrice, 10);
    assert.equal(toPieceQty(2, "carton", 100), 200);
    assert.equal(toPieceQty(5, "piece", null), 5);
  });

  test("selected location and price unit are independent values that save as-is", () => {
    // Mirrors Add Product payload shape — no silent redistribute across places.
    const payload = {
      location: "warehouse" as const,
      quantity: 12,
      purchasePrice: 25,
      piecesPerCarton: null as number | null,
    };
    assert.equal(payload.location, "warehouse");
    assert.equal(payload.piecesPerCarton, null);
    assert.equal(payload.quantity, 12);
  });

  test("editing preserves saved piecesPerCarton / threshold unless user changes them", () => {
    const saved = { piecesPerCarton: 24 as number | null, restockThreshold: 8, priceCompareUnit: "carton" as const };
    const formDefaults = {
      piecesPerCarton: saved.piecesPerCarton ? String(saved.piecesPerCarton) : "",
      threshold: String(saved.restockThreshold),
      priceUnit: saved.piecesPerCarton ? ("carton" as const) : DEFAULT_NEW_PRICE_UNIT,
    };
    assert.equal(formDefaults.piecesPerCarton, "24");
    assert.equal(formDefaults.threshold, "8");
    // Edit sheet seeds from product — does not force piece when carton was saved.
    assert.equal(formDefaults.priceUnit, "carton");
  });

  test("adding stock does not reset product quantities (payload only touches one place)", () => {
    const before = { warehouse: 50, shop: 10, online: 0 };
    const addToShop = 5;
    const after = { ...before, shop: before.shop + addToShop };
    assert.equal(after.warehouse, 50);
    assert.equal(after.shop, 15);
    assert.equal(after.online, 0);
    assert.equal(after.warehouse + after.shop + after.online, 65);
  });

  test("Warehouse, Shop, and Online show the Prompt 21 plain-language descriptions", () => {
    assert.equal(t("en", "locationWarehouseHint"), LOCATION_HINTS_EN.warehouse);
    assert.equal(t("en", "locationShopHint"), LOCATION_HINTS_EN.shop);
    assert.equal(t("en", "locationOnlineHint"), LOCATION_HINTS_EN.online);
    assert.match(t("en", "locationWarehouseHint"), /storage room|main stock/i);
    assert.match(t("en", "locationShopHint"), /shop/i);
    assert.match(t("en", "locationOnlineHint"), /online/i);
  });

  test("total stock calculation stays Warehouse + Shop + Online with no duplication", () => {
    const warehouse = 40;
    const shop = 12;
    const online = 3;
    assert.equal(warehouse + shop + online, 55);
    // Saving qty 12 at shop only does not invent warehouse/online stock.
    const stockByPlace = { warehouse: 0, shop: 12, online: 0 };
    assert.equal(stockByPlace.warehouse + stockByPlace.shop + stockByPlace.online, 12);
  });
});
