import { requireOwnerAccess } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { ensureDbReady } from "@/lib/db";
import { listActivity } from "@/lib/db/activity";

export const runtime = "nodejs";

/** Owner-only accountability log for the dedicated /activity screen. Staff never reach this. */
export async function GET() {
  await ensureDbReady();
  const ctx = await requireOwnerAccess("Activity");
  if (!ctx) return jsonNoStore({ error: "Please log in as an owner" }, { status: 403 });
  const activity = await listActivity(ctx.business.id, 200);
  return jsonNoStore({ activity, role: ctx.role });
}
