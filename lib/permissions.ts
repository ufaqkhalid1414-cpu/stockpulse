import {
  canAccessPrices,
  canAddProduct,
  canAddStock,
  canArchiveProduct,
  canCorrectStock,
  canEditProduct,
  canImportProducts,
  canManageOwners,
  canManagePeople,
  canMoveStock,
  canRecordSale,
  canResetBusiness,
  canSendReports,
  isOwnerRole,
  type AccessRole,
} from "@/lib/access";
import type { AppState } from "@/lib/types";

/**
 * Every mutating action exposed by POST /api/stock, mapped to the access-helper
 * that decides whether a role may call it. This is the single source of truth
 * for the permission matrix — the route handlers call the same `can*` helpers,
 * and this map lets tests assert the whole matrix without hitting Firestore.
 */
const STOCK_ACTION_CHECKS: Record<string, (role: AccessRole) => boolean> = {
  addProduct: canAddProduct,
  addStaff: canManagePeople,
  removeStaff: canManagePeople,
  updateStaffPermission: canManagePeople,
  addOwner: canManageOwners,
  removeOwner: canManageOwners,
  // Staff permissions are split: add / sell / move are separate roles.
  addStock: canAddStock,
  recordSale: canRecordSale,
  moveStock: canMoveStock,
  correctCount: canCorrectStock,
  editProduct: canEditProduct,
  setPriceCompareUnit: canEditProduct,
  archiveProduct: canArchiveProduct,
  restoreProduct: canArchiveProduct,
  recordPurchasePrice: canAccessPrices,
  backup: canSendReports,
  sendDailyReport: canSendReports,
  sendMonthlyChart: canSendReports,
  sendWeeklyChart: canSendReports,
  updateNotificationPrefs: canSendReports,
  requestChangeMyNumber: canSendReports,
  confirmChangeMyNumber: canSendReports,
  addPlace: canSendReports,
  renamePlace: canSendReports,
  removePlace: canSendReports,
  addWarehouse: canSendReports,
  renameWarehouse: canSendReports,
  removeWarehouse: canSendReports,
  addShop: canSendReports,
  renameShop: canSendReports,
  removeShop: canSendReports,
  addOnlineStore: canSendReports,
  renameOnlineStore: canSendReports,
  removeOnlineStore: canSendReports,
  resetAccount: canResetBusiness,
  importProducts: canImportProducts,
};

/** True when `role` is allowed to invoke POST /api/stock `{ action }`. Unknown actions are always denied. */
export function allowedStockAction(role: AccessRole, action: string): boolean {
  const check = STOCK_ACTION_CHECKS[action];
  if (!check) return false;
  return check(role);
}

/** Every action name known to the stock permission matrix (used by table-driven tests). */
export function knownStockActions(): string[] {
  return Object.keys(STOCK_ACTION_CHECKS);
}

const EMPTY_SHOPIFY = {
  connected: false,
  shopDomain: null,
  connectedAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  lastSyncCount: 0,
} as const;

/**
 * Filters a full business state down to what a given role may see.
 * Owners (equal/co) get the full state unchanged.
 * Staff (add/view) get: products — WITH purchasePrice (per product decision),
 * but with price-history arrays emptied — plus the basic business name,
 * language, and onboarded flag. Everything else that staff never need and
 * never reach a page for (owners list, staff list, backups, activity log,
 * alerts, Shopify connection, primary WhatsApp) is stripped.
 */
export function sanitizeBusinessState(role: AccessRole, state: AppState): AppState {
  if (isOwnerRole(role)) return state;
  return {
    ...state,
    products: state.products.map((product) => ({ ...product, priceHistory: [] })),
    // Staff keep `places` so stock sheets show warehouse names.
    staff: [],
    owners: [],
    backupHistory: [],
    activityHistory: [],
    alerts: [],
    lastBackup: null,
    ownerWhatsapp: null,
    shopify: { ...EMPTY_SHOPIFY },
    archivedProducts: [],
  };
}
