import type { BusinessRow } from "@/lib/db/queries";
import {
  ensureOwnersTable,
  findMembershipByPhone,
  getBusiness,
  type Membership,
} from "@/lib/db/queries";
import { getSession, type AuthSession } from "@/lib/session";

export type AccessRole = "equal_owner" | "co_owner" | "staff_add" | "staff_view";

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
  return role === "staff_add" || role === "staff_view";
}

export function canAddProduct(role: AccessRole) {
  return role === "equal_owner" || role === "co_owner" || role === "staff_add";
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

export function homePathForRole(role: AccessRole) {
  if (role === "staff_view") return "/items";
  if (role === "staff_add") return "/add-product";
  return "/dashboard";
}

export async function requireAccess(): Promise<AccessContext | null> {
  await ensureOwnersTable();
  const session = await getSession();
  if (!session?.businessId) return null;
  const business = await getBusiness(session.businessId);
  if (!business) return null;
  const membership = await findMembershipByPhone(session.phone);
  if (!membership || membership.businessId !== business.id) return null;
  return { session, business, role: membership.role, membership };
}

export async function requireOwnerAccess(): Promise<AccessContext | null> {
  const ctx = await requireAccess();
  if (!ctx || !isOwnerRole(ctx.role)) return null;
  return ctx;
}

export async function requireEqualOwner(): Promise<AccessContext | null> {
  const ctx = await requireAccess();
  if (!ctx || ctx.role !== "equal_owner") return null;
  return ctx;
}
