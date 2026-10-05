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
  shopifyVariantId?: string | null;
};

/** Public Shopify connection status (token never sent to the client). */
export type ShopifyConnectionPublic = {
  connected: boolean;
  shopDomain: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
};

export type Permission = "add" | "view";

export type OwnerAccess = "equal" | "co";

export type AccessRole = "equal_owner" | "co_owner" | "staff_add" | "staff_view";

export type StaffMember = {
  id: string;
  name: string;
  phone: string;
  permission: Permission;
  addedAt: string;
};

export type BusinessOwner = {
  id: string;
  name: string;
  phone: string;
  access: OwnerAccess;
  isPrimary: boolean;
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
  owners: BusinessOwner[];
  lastBackup: string | null;
  backupHistory: BackupHistoryItem[];
  connectedStores: number;
  ownerWhatsapp: string | null;
  priceThreshold: number;
  alerts: AlertItem[];
  isSample?: boolean;
  shopify?: ShopifyConnectionPublic;
};

export type BackupHistoryItem = {
  id: string;
  stampedAt: string;
  status: "success" | "failed";
  storagePath: string | null;
  error: string | null;
};
