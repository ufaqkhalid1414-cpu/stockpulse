import type { AppState, PriceCompareUnit, PriceEntry, Product, StaffMember } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { DEFAULT_PLACES } from "@/lib/places";
import { syncQtyMirrors } from "@/lib/stock-math";

const months = ["apr", "may", "jun", "jul", "aug", "sep"];

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function history(prices: number[]) {
  return months.map((month, index) => ({ month, price: prices[index] }));
}

function entriesFromHistory(
  productId: string,
  priceHistory: Product["priceHistory"],
  piecesPerCarton: number | null,
): PriceEntry[] {
  const year = 2025;
  return priceHistory.map((point, index) => {
    const month = MONTH_INDEX[point.month] ?? 3;
    const day = Math.min(28, 4 + index * 4);
    return {
      id: `${productId}-ph-${index}`,
      recordedAt: new Date(Date.UTC(year, month, day, 10, 0, 0)).toISOString(),
      pricePerPiece: point.price,
      piecesPerCarton,
    };
  });
}

function defaultCompareUnit(piecesPerCarton: number | null): PriceCompareUnit {
  return piecesPerCarton && piecesPerCarton >= 2 ? "carton" : "piece";
}

export const SAMPLE_BUSINESS_NAME = "General Store";

type ProductSeed = Omit<Product, "priceCompareUnit" | "priceEntries"> &
  Partial<Pick<Product, "priceCompareUnit" | "priceEntries">>;

export function hydrateProduct(product: ProductSeed): Product {
  const sample = sampleProducts.find((item) => item.id === product.id);
  const base: ProductSeed = sample
    ? {
        ...product,
        warehouseQty: sample.warehouseQty,
        shopQty: sample.shopQty,
        onlineQty: sample.onlineQty,
      }
    : {
        ...product,
        warehouseQty: product.warehouseQty ?? 0,
        shopQty: product.shopQty ?? 0,
        onlineQty: product.onlineQty ?? 0,
        piecesPerCarton: product.piecesPerCarton ?? null,
      };

  const ppc = base.piecesPerCarton ?? null;
  const priceHistory = base.priceHistory?.length ? base.priceHistory : flatHistory(base.purchasePrice);
  const priceEntries =
    base.priceEntries && base.priceEntries.length > 0
      ? base.priceEntries
      : entriesFromHistory(base.id, priceHistory, ppc);
  const priceCompareUnit = base.priceCompareUnit ?? defaultCompareUnit(ppc);

  const qtys = syncQtyMirrors({
    warehouse: base.warehouseQty ?? 0,
    shop: base.shopQty ?? 0,
    online: base.onlineQty ?? 0,
    ...(base.stockByPlace || {}),
  });
  return {
    ...base,
    ...qtys,
    priceHistory,
    priceEntries,
    priceCompareUnit,
    piecesPerCarton: ppc,
  };
}

export function flatHistory(price: number) {
  return history(months.map(() => price));
}

const sampleProducts: ProductSeed[] = [
  {
    id: "rice",
    name: "Basmati Rice",
    category: "Staples",
    variant: "5 kg",
    warehouseQty: 48,
    shopQty: 16,
    onlineQty: 12,
    purchasePrice: 2450,
    piecesPerCarton: null,
    restockThreshold: 20,
    priceHistory: history([2280, 2300, 2320, 2360, 2380, 2450]),
    photo: "/samples/rice.jpg",
  },
  {
    id: "oil",
    name: "Cooking Oil",
    category: "Staples",
    variant: "5 L",
    warehouseQty: 22,
    shopQty: 8,
    onlineQty: 6,
    purchasePrice: 3180,
    piecesPerCarton: null,
    restockThreshold: 15,
    priceHistory: history([2800, 2860, 2900, 2940, 2935, 3180]),
    photo: "/samples/oil.jpg",
  },
  {
    id: "flour",
    name: "Wheat Flour",
    category: "Staples",
    variant: "10 kg",
    warehouseQty: 60,
    shopQty: 24,
    onlineQty: 0,
    purchasePrice: 1280,
    piecesPerCarton: null,
    restockThreshold: 30,
    priceHistory: history([1240, 1250, 1260, 1270, 1280, 1280]),
  },
  {
    id: "sugar",
    name: "Sugar",
    category: "Staples",
    variant: "1 kg",
    warehouseQty: 90,
    shopQty: 0,
    onlineQty: 18,
    purchasePrice: 180,
    piecesPerCarton: null,
    restockThreshold: 40,
    priceHistory: history([210, 205, 200, 198, 190, 180]),
  },
  {
    id: "lentils",
    name: "Masoor Lentils",
    category: "Pulses",
    variant: "1 kg",
    warehouseQty: 10,
    shopQty: 4,
    onlineQty: 0,
    purchasePrice: 320,
    piecesPerCarton: null,
    restockThreshold: 20,
    priceHistory: history([300, 305, 310, 318, 325, 320]),
  },
  {
    id: "tea",
    name: "Tea Leaves",
    category: "Pantry",
    variant: "400 g",
    warehouseQty: 8,
    shopQty: 4,
    onlineQty: 2,
    purchasePrice: 560,
    piecesPerCarton: null,
    restockThreshold: 15,
    priceHistory: history([500, 510, 515, 520, 530, 560]),
  },
  {
    id: "milk",
    name: "Milk Powder",
    category: "Dairy",
    variant: "900 g",
    warehouseQty: 6,
    shopQty: 3,
    onlineQty: 0,
    purchasePrice: 1150,
    piecesPerCarton: null,
    restockThreshold: 12,
    priceHistory: history([1080, 1090, 1100, 1110, 1120, 1150]),
  },
  {
    id: "eggs",
    name: "Eggs",
    category: "Dairy",
    variant: "Dozen",
    warehouseQty: 0,
    shopQty: 18,
    onlineQty: 12,
    purchasePrice: 380,
    piecesPerCarton: null,
    restockThreshold: 24,
    priceHistory: history([340, 350, 360, 370, 375, 380]),
  },
  {
    id: "chilli",
    name: "Red Chilli Powder",
    category: "Spices",
    variant: "200 g",
    warehouseQty: 5,
    shopQty: 2,
    onlineQty: 0,
    purchasePrice: 210,
    piecesPerCarton: null,
    restockThreshold: 12,
    priceHistory: history([190, 195, 198, 200, 205, 210]),
  },
  {
    id: "salt",
    name: "Iodised Salt",
    category: "Staples",
    variant: "800 g",
    warehouseQty: 40,
    shopQty: 22,
    onlineQty: 10,
    purchasePrice: 70,
    piecesPerCarton: null,
    restockThreshold: 18,
    priceHistory: history([68, 68, 70, 70, 70, 70]),
  },
  {
    id: "ghee",
    name: "Desi Ghee",
    category: "Staples",
    variant: "1 kg",
    warehouseQty: 14,
    shopQty: 6,
    onlineQty: 0,
    purchasePrice: 1450,
    piecesPerCarton: null,
    restockThreshold: 10,
    priceHistory: history([1320, 1340, 1360, 1380, 1400, 1450]),
  },
  {
    id: "soap",
    name: "Laundry Soap",
    category: "Household",
    variant: "Bar",
    warehouseQty: 50,
    shopQty: 0,
    onlineQty: 15,
    purchasePrice: 85,
    piecesPerCarton: 100,
    restockThreshold: 24,
    priceHistory: history([80, 80, 82, 84, 84, 85]),
  },
];

const sampleStaff: StaffMember[] = [
  {
    id: "s1",
    name: "Ahmed Khan",
    phone: "+92 300 555 0142",
    permission: "add",
    addedAt: "2026-08-12T08:30:00.000Z",
  },
  {
    id: "s2",
    name: "Sara Ali",
    phone: "+92 321 555 0198",
    permission: "view",
    addedAt: "2026-09-03T08:30:00.000Z",
  },
];

function thisMorning() {
  const date = new Date();
  date.setHours(6, 40, 0, 0);
  return date.toISOString();
}

export function createSampleState(businessName: string, language: Lang): AppState {
  return {
    onboarded: true,
    businessName,
    language,
    products: sampleProducts.map((product) => hydrateProduct({
      ...product,
      priceHistory: product.priceHistory.map((point) => ({ ...point })),
    })),
    places: DEFAULT_PLACES.map((p) => ({ ...p })),
    staff: sampleStaff.map((member) => ({ ...member })),
    owners: [],
    lastBackup: thisMorning(),
    backupHistory: [],
    activityHistory: [],
    connectedStores: 2,
    ownerWhatsapp: null,
    priceThreshold: 10,
    alerts: [],
    shopify: {
      connected: false,
      shopDomain: null,
      connectedAt: null,
      lastSyncAt: null,
      lastSyncError: null,
      lastSyncCount: 0,
    },
  };
}

export const defaultState: AppState = {
  onboarded: false,
  businessName: "",
  language: "en",
  products: [],
  places: DEFAULT_PLACES.map((p) => ({ ...p })),
  staff: [],
  owners: [],
  lastBackup: null,
  backupHistory: [],
  activityHistory: [],
  connectedStores: 0,
  ownerWhatsapp: null,
  priceThreshold: 10,
  alerts: [],
  shopify: {
    connected: false,
    shopDomain: null,
    connectedAt: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncCount: 0,
  },
};
