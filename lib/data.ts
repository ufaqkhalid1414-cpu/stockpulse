import type { AppState, Product, StaffMember } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

const months = ["apr", "may", "jun", "jul", "aug", "sep"];

function history(prices: number[]) {
  return months.map((month, index) => ({ month, price: prices[index] }));
}

export const SAMPLE_BUSINESS_NAME = "General Store";

export function hydrateProduct(product: Product): Product {
  const sample = sampleProducts.find((item) => item.id === product.id);
  if (sample) {
    return {
      ...product,
      warehouseQty: sample.warehouseQty,
      shopQty: sample.shopQty,
      onlineQty: sample.onlineQty,
    };
  }
  return {
    ...product,
    warehouseQty: product.warehouseQty ?? 0,
    shopQty: product.shopQty ?? 0,
    onlineQty: product.onlineQty ?? 0,
  };
}

export function flatHistory(price: number) {
  return history(months.map(() => price));
}

const sampleProducts: Product[] = [
  {
    id: "rice",
    name: "Basmati Rice",
    category: "Staples",
    variant: "5 kg",
    warehouseQty: 48,
    shopQty: 16,
    onlineQty: 12,
    purchasePrice: 2450,
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
    staff: sampleStaff.map((member) => ({ ...member })),
    lastBackup: thisMorning(),
    connectedStores: 2,
    ownerWhatsapp: null,
    priceThreshold: 10,
    alerts: [],
  };
}

export const defaultState: AppState = {
  onboarded: false,
  businessName: "",
  language: "en",
  products: [],
  staff: [],
  lastBackup: null,
  connectedStores: 0,
  ownerWhatsapp: null,
  priceThreshold: 10,
  alerts: [],
};
