import type { Lang } from "@/lib/i18n";

export type Location = "warehouse" | "shop" | "online";

export type PricePoint = {
  month: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  variant: string;
  warehouseQty: number;
  shopQty: number;
  onlineQty: number;
  purchasePrice: number;
  restockThreshold: number;
  priceHistory: PricePoint[];
  photo?: string;
};

export type Permission = "add" | "view";

export type StaffMember = {
  id: string;
  name: string;
  phone: string;
  permission: Permission;
  addedAt: string;
};

export type AlertItem = {
  id: string;
  business_id: string;
  product_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  seen: number;
};

export type AppState = {
  onboarded: boolean;
  businessName: string;
  language: Lang;
  products: Product[];
  staff: StaffMember[];
  lastBackup: string | null;
  connectedStores: number;
  ownerWhatsapp: string | null;
  priceThreshold: number;
  alerts: AlertItem[];
  isSample?: boolean;
};
