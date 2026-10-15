import type { Lang } from "@/lib/i18n";

/** Place id: builtin "warehouse" | "shop" | "online", or an extra warehouse id. */
export type Location = string;

export type StockPlaceKind = "warehouse" | "shop" | "online";

/** A stock place on the business (warehouses can be many; shop/online stay one each). */
export type StockPlace = {
  id: string;
  name: string;
  kind: StockPlaceKind;
};

/** Legacy month-folded point — still used where old charts expect it. */
export type PricePoint = {
  month: string;
  price: number;
};

/** One stock-entry price row (Prompt 16 Part B). Price is always per piece underneath. */
export type PriceEntry = {
  id: string;
  /** ISO timestamp when this purchase price was recorded. */
  recordedAt: string;
  /** Purchase price per piece at the time of entry. */
  pricePerPiece: number;
  /**
   * Carton size saved with this entry so later edits to the product carton
   * size never rewrite history. null = piece-only at the time.
   */
  piecesPerCarton: number | null;
};

export type PriceCompareUnit = "piece" | "carton";

export type Product = {
  id: string;
  name: string;
  category: string;
  variant: string;
  /** Mirror of stockByPlace.warehouse — kept for older callers. */
  warehouseQty: number;
  /** Mirror of stockByPlace.shop. */
  shopQty: number;
  /** Mirror of stockByPlace.online. */
  onlineQty: number;
  /** Qty per place id (warehouses + shop + online). Source of truth when present. */
  stockByPlace?: Record<string, number>;
  /** Always stored as price per piece (smallest sellable unit). */
  purchasePrice: number;
  /** One low-stock number per product; applied to each place separately (Prompt 20). Default 5. */
  restockThreshold: number;
  /** Places that have ever held this product — never show/alert places that never held it. */
  everHeldByPlace?: Record<string, boolean>;
  /** Per-place: true = already alerted, silent until qty rises above the number again. */
  lowStockAlertedByPlace?: Record<string, boolean>;
  /**
   * Pieces in one carton when the product is bought in bulk.
   * null / omitted = piece-only product (no carton UI anywhere).
   */
  piecesPerCarton: number | null;
  /**
   * Owner's chosen unit for price comparison charts/alerts (Prompt 16 Part B).
   * Default: unit used at the product's first stock entry.
   */
  priceCompareUnit: PriceCompareUnit;
  /** Entry-level history (newest last in array for chart helpers). */
  priceEntries: PriceEntry[];
  /** Month-folded view derived from entries (compat). */
  priceHistory: PricePoint[];
  photo?: string;
  shopifyVariantId?: string | null;
  /** Soft-deleted — excluded from lists/alerts/reports by default. Stock history is kept. */
  archived?: boolean;
  /** Prompt 16 Part A — location flagged until Correct count clears it. */
  needsRecountWarehouse?: boolean;
  needsRecountShop?: boolean;
  needsRecountOnline?: boolean;
  /** Recount flags per place id (source of truth when present). */
  recountByPlace?: Record<string, boolean>;
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

/** Staff dropdown: one capability each (view / add stock / record sale / move). */
export type Permission = "view" | "add" | "sell" | "move";

export type OwnerAccess = "equal" | "co";

export type AccessRole =
  | "equal_owner"
  | "co_owner"
  | "staff_view"
  | "staff_add"
  | "staff_sell"
  | "staff_move";

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
  /** Optional — Google / email login owners. */
  email?: string | null;
  access: OwnerAccess;
  isPrimary: boolean;
  addedAt: string;
  /** Prompt 18 — per-person notification switches (owners/co-owners only). */
  notificationPrefs?: {
    dailyReport: boolean;
    dailyReportTime: string;
    priceAlerts: boolean;
    lowStockAlerts: boolean;
    recountAlerts: boolean;
    monthlyChart: boolean;
    pauseAll: boolean;
  };
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
  /** Stock places for this business (warehouses + shop + online). */
  places: StockPlace[];
  staff: StaffMember[];
  owners: BusinessOwner[];
  lastBackup: string | null;
  backupHistory: BackupHistoryItem[];
  activityHistory: ActivityHistoryItem[];
  connectedStores: number;
  ownerWhatsapp: string | null;
  priceThreshold: number;
  alerts: AlertItem[];
  isSample?: boolean;
  shopify?: ShopifyConnectionPublic;
  /** Owner-only — archived products, hidden from the main `products` list. */
  archivedProducts?: Product[];
};

export type BackupHistoryItem = {
  id: string;
  stampedAt: string;
  status: "success" | "failed";
  storagePath: string | null;
  error: string | null;
};

export type ActivityCategory = "stock" | "prices" | "products" | "staff" | "settings" | "security";

export type ActivityAction =
  | "product_added"
  | "stock_deducted"
  | "stock_added"
  | "stock_moved"
  | "stock_corrected"
  | "stock_blocked"
  | "product_edited"
  | "product_archived"
  | "product_restored"
  | "purchase_price_changed"
  | "staff_added"
  | "staff_removed"
  | "staff_permission_changed"
  | "owner_added"
  | "owner_removed"
  | "settings_changed"
  | "access_blocked";

/** Tenant-scoped accountability log (WHO / WHAT / WHERE / WHEN / before→after). */
export type ActivityHistoryItem = {
  id: string;
  category: ActivityCategory;
  action: ActivityAction;
  actorPhone: string;
  actorName: string;
  actorRole: AccessRole;
  productId: string | null;
  productName: string | null;
  location: Location | null;
  fromLocation: Location | null;
  toLocation: Location | null;
  quantityChange: number | null;
  previousValue: number | null;
  newValue: number | null;
  previousTotal: number | null;
  newTotal: number | null;
  summary: string;
  detail: string | null;
  status: "success";
  createdAt: string;
};
