/**
 * UI helpers for staff remove / role change.
 * Server revocation lives in removeStaff / updateStaffPermission + revokeSessionsForPhone.
 */

export function staffRemoveConfirmMessage(name: string, phone: string) {
  const who = [name.trim(), phone.trim()].filter(Boolean).join(" · ");
  return `Remove ${who || "this staff member"}? They will lose access immediately.`;
}

/** True when the route handler text includes immediate session revoke after staff remove/permission change. */
export function routeRevokesStaffSessions(routeSource: string) {
  const removeBlock = routeSource.includes("action === \"removeStaff\"") && routeSource.includes("revokeSessionsForPhone");
  const permBlock =
    routeSource.includes("action === \"updateStaffPermission\"") && routeSource.includes("revokeSessionsForPhone");
  return removeBlock && permBlock;
}
