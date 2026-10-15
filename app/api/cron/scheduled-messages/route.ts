import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { runScheduledMessages } from "@/lib/scheduled-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prompt 18 — scheduled reports tick.
 *
 * vercel.json: "0 18 * * *" (18:00 UTC ≈ 23:00 Asia/Karachi).
 * Hobby allows about one cron run per day; Pro can use every-15-min cron for tighter timing.
 * Late runs are fine — sent markers claim once per owner/period.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development" || process.env.OTP_DEV_MODE === "1") return true;
    return false;
  }
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

function baseUrl(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureDbReady();
  const result = await runScheduledMessages(baseUrl(request));
  await persistDb();
  return NextResponse.json({
    ok: true,
    scheduler: {
      path: "/api/cron/scheduled-messages",
      schedule: "0 18 * * *",
      note:
        "Once daily at 18:00 UTC (≈23:00 Asia/Karachi). Finds owners whose local send time has already passed and sends each once. Default daily time is 20:00 local.",
      vercelLimits:
        "Vercel Hobby: cron jobs typically once per day (not every 15 minutes). Pro can use a every-15-minute cron for ±15 minute precision. This route maxDuration is 60s. Late runs are safe because of sent markers.",
    },
    result,
  });
}
