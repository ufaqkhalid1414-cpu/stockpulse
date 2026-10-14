import type { BusinessRow } from "@/lib/db/queries";
import {
  ensureOwnersTable,
  findMembershipForSession,
  getBusiness,
  type Membership,
} from "@/lib/db/queries";
import { actorFromAccess, recordActivity } from "@/lib/db/activity";
import { getSession, type AuthSession } from "@/lib/session";
import type { AccessRole } from "@/lib/types";
import { roleFromPermission as mapPermissionToRole, parseStaffPermission } from "@/lib/staff-permission";

export type { AccessRole };
export { parseStaffPermission, mapPermissionToRole as roleFromPermission };

export type AccessContext = {
  session: AuthSession;
  business: BusinessRow;
  role: AccessRole;
  membership: Membership;
};

export function isOwnerRole(role: AccessRole) {
  return role === "equal_owner" || role === "co_owner";
}

export function isStaffRole(role: AccessRole) {
  return (
    role === "staff_view" ||
    role === "staff_add" ||
    role === "staff_sell" ||
    role === "staff_move"
  );
}

/** New products + add-stock quantity — owners and staff with "add". */
export function canAddProduct(role: AccessRole) {
  return isOwnerRole(role) || role === "staff_add";
}

export function canAddStock(role: AccessRole) {
  return canAddProduct(role);
}

/** Record a sale (deduct stock) — owners and staff with "sell". */
export function canRecordSale(role: AccessRole) {
  return isOwnerRole(role) || role === "staff_sell";
}

/** Move stock between places — owners and staff with "move". */
export function canMoveStock(role: AccessRole) {
  return isOwnerRole(role) || role === "staff_move";
}

/** Any of the three everyday stock-quantity actions. */
export function canMutateStock(role: AccessRole) {
  return canAddStock(role) || canRecordSale(role) || canMoveStock(role);
}

/** Correcting an absolute count after a physical recount — owners only. */
export function canCorrectStock(role: AccessRole) {
  return isOwnerRole(role);
}

/** Editing product metadata — owners only. */
export function canEditProduct(role: AccessRole) {
  return isOwnerRole(role);
}

/** Archiving/restoring a product — owners only. */
export function canArchiveProduct(role: AccessRole) {
  return isOwnerRole(role);
}

export function canManagePeople(role: AccessRole) {
  return role === "equal_owner" || role === "co_owner";
}

export function canManageOwners(role: AccessRole) {
  return role === "equal_owner";
}

export function canAccessDashboard(role: AccessRole) {
  return isOwnerRole(role);
}

export function canAccessSettings(role: AccessRole) {
  return isOwnerRole(role);
}

export function canAccessPrices(role: AccessRole) {
  return isOwnerRole(role);
}

export function canSendReports(role: AccessRole) {
  return isOwnerRole(role);
}

export function canResetBusiness(role: AccessRole) {
  return role === "equal_owner";
}

/** CSV/Excel product import — owners and co-owners only. */
export function canImportProducts(role: AccessRole) {
  return isOwnerRole(role);
}

export function homePathForRole(role: AccessRole) {
  if (role === "staff_add") return "/add-product";
  if (isStaffRole(role)) return "/items";
  return "/dashboard";
}

export async function requireAccess(): Promise<AccessContext | null> {
  await ensureOwnersTable();
  const session = await getSession();
  if (!session?.businessId) return null;
  const business = await getBusiness(session.businessId);
  if (!business) return null;
  const membership = await findMembershipForSession(session);
  if (!membership || membership.businessId !== business.id) return null;
  return { session, business, role: membership.role, membership };
}

/**
 * Owner-only gate. When `routeLabel` is given and a logged-in staff member
 * hits an owner-only route, we record a blocked-access activity entry.
 */
export async function requireOwnerAccess(routeLabel?: string): Promise<AccessContext | null> {
  const ctx = await requireAccess();
  if (!ctx) return null;
  if (!isOwnerRole(ctx.role)) {
    if (routeLabel) {
      const actor = actorFromAccess(ctx);
      await recordActivity(ctx.business.id, {
        category: "security",
        action: "access_blocked",
        actor,
        summary: `${actor.name} tried to open ${routeLabel}. Blocked.`,
        detail: `Role: ${ctx.role}`,
      }).catch((err) => console.error("[access] failed to record blocked access", err));
    }
    return null;
  }
  return ctx;
}

export async function requireEqualOwner(): Promise<AccessContext | null> {
  const ctx = await requireAccess();
  if (!ctx || ctx.role !== "equal_owner") return null;
  return ctx;
}
