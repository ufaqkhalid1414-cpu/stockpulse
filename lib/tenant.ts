/**
 * Pure multi-tenant path-scoping helpers. No Firestore, no I/O — these exist
 * so the "every resource lives under businesses/{businessId}/..." rule, and
 * the "never let session business A touch resource business B" rule, are
 * expressed as small testable functions instead of only living implicitly
 * inside `lib/db/queries.ts`'s `bizRef()` calls.
 *
 * `lib/db/queries.ts` builds real Firestore doc refs via
 * `firestoreDb().collection("businesses").doc(businessId)...` — this module
 * documents/tests the same path shape in plain strings so it can be asserted
 * without a live Firestore connection.
 */

const BUSINESS_ROOT = "businesses";

/**
 * Builds the canonical path `businesses/{businessId}/segment1/segment2/...`
 * that every tenant-scoped Firestore document in this app lives under.
 * Throws if `businessId` is missing/blank, since an unscoped path would be
 * a cross-tenant bug waiting to happen.
 */
export function businessPath(businessId: string, ...segments: string[]): string {
  const id = String(businessId || "").trim();
  if (!id) throw new Error("businessPath: businessId is required");
  const cleanSegments = segments.map((s) => String(s || "").trim()).filter(Boolean);
  if (cleanSegments.length !== segments.length) {
    throw new Error("businessPath: path segments must not be blank");
  }
  return [BUSINESS_ROOT, id, ...cleanSegments].join("/");
}

/** True when `path` is scoped under `businesses/{businessId}/...` for the given businessId. */
export function isScopedToBusiness(path: string, businessId: string): boolean {
  const id = String(businessId || "").trim();
  if (!id) return false;
  return path === `${BUSINESS_ROOT}/${id}` || path.startsWith(`${BUSINESS_ROOT}/${id}/`);
}

/**
 * The core tenant-isolation check every route/query must pass before
 * touching a resource: the resource's own businessId must match the
 * caller's session businessId. Mirrors a 404 (not 403) on purpose — a
 * mismatched business should look like "not found", not "forbidden",
 * so one tenant can never confirm another tenant's resource even exists.
 */
export function assertSameBusiness(
  sessionBusinessId: string | null | undefined,
  resourceBusinessId: string | null | undefined,
): boolean {
  if (!sessionBusinessId || !resourceBusinessId) return false;
  return sessionBusinessId === resourceBusinessId;
}
