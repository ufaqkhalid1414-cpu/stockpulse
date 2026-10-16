import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { canManagePeople } from "@/lib/access";
import { allowedStockAction } from "@/lib/permissions";
import { routeRevokesStaffSessions, staffRemoveConfirmMessage } from "@/lib/staff-management";
import type { AccessRole } from "@/lib/types";

const ALL_ROLES: AccessRole[] = [
  "equal_owner",
  "co_owner",
  "staff_add",
  "staff_view",
  "staff_sell",
  "staff_move",
];

describe("Prompt 26 — staff edit, remove, immediate revocation", () => {
  test("owners/co-owners may manage staff; staff roles cannot", () => {
    for (const role of ALL_ROLES) {
      const allowed = canManagePeople(role);
      assert.equal(allowed, role === "equal_owner" || role === "co_owner", role);
      assert.equal(allowedStockAction(role, "removeStaff"), allowed);
      assert.equal(allowedStockAction(role, "updateStaffPermission"), allowed);
      assert.equal(allowedStockAction(role, "addStaff"), allowed);
    }
  });

  test("API scopes staff actions to ctx.business.id and revokes sessions", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/stock/route.ts"), "utf8");
    assert.equal(routeRevokesStaffSessions(route), true);
    const removeBlock = route.slice(
      route.indexOf('action === "removeStaff"'),
      route.indexOf('action === "updateStaffPermission"'),
    );
    assert.match(removeBlock, /getStaff\(ctx\.business\.id\)/);
    assert.match(removeBlock, /removeStaff\(ctx\.business\.id,/);
    assert.match(removeBlock, /revokeSessionsForPhone\(existing\.phone\)/);
    const permBlock = route.slice(
      route.indexOf('action === "updateStaffPermission"'),
      route.indexOf('action === "addOwner"'),
    );
    assert.match(permBlock, /updateStaffPermission\(ctx\.business\.id,/);
    assert.match(permBlock, /revokeSessionsForPhone\(existing\.phone\)/);
  });

  test("revoked sessions are rejected by getSession", () => {
    const session = readFileSync(path.join(process.cwd(), "lib/session.ts"), "utf8");
    assert.match(session, /revoked:\s*true/);
    assert.match(session, /if \(row\.revoked === true\)/);
  });

  test("requireAccess re-reads membership each request (not session.role)", () => {
    const access = readFileSync(path.join(process.cwd(), "lib/access.ts"), "utf8");
    assert.match(access, /findMembershipForSession\(session\)/);
    assert.match(access, /role: membership\.role/);
  });

  test("Staff UI requires confirmation before remove and wires edit/remove", () => {
    const page = readFileSync(path.join(process.cwd(), "app/staff/page.tsx"), "utf8");
    assert.match(page, /window\.confirm/);
    assert.match(page, /removeStaffConfirm|staffRemoveConfirmMessage/);
    assert.match(page, /updateStaffPermission/);
    assert.match(page, /removeStaff/);
    assert.match(page, /actingStaffId/);
  });

  test("store exposes removeStaff and updateStaffPermission", () => {
    const store = readFileSync(path.join(process.cwd(), "lib/store.tsx"), "utf8");
    assert.match(store, /action: "removeStaff"/);
    assert.match(store, /action: "updateStaffPermission"/);
  });

  test("remove confirm message names the staff member", () => {
    const msg = staffRemoveConfirmMessage("Ali", "+923001234567");
    assert.match(msg, /Ali/);
    assert.match(msg, /\+923001234567/);
    assert.match(msg, /immediately/i);
  });

  test("removeStaff deletes membership doc but activity history is separate (hard delete of staff only)", () => {
    const queries = readFileSync(path.join(process.cwd(), "lib/db/queries.ts"), "utf8");
    const block = queries.slice(queries.indexOf("export async function removeStaff"), queries.indexOf("export async function updateStaffPermission"));
    assert.match(block, /\.delete\(\)/);
    assert.match(block, /clearPhoneIndex/);
    assert.doesNotMatch(block, /activity|sales|products/);
  });
});
