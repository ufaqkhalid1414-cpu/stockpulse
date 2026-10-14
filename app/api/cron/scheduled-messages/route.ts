import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { runScheduledMessages } from "@/lib/scheduled-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prompt 18 — frequent scheduler tick (Vercel Cron every 15 minutes).
 *
 * Vercel Hobby: cron minimum interval is once/day on some plans; Pro allows
 * more frequent schedules. We use every-15-min so a late tick still catches anyone
 * whose local send time has passed (claim markers prevent duplicates).
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
      schedule: "*/15 * * * *",
      note:
        "Runs every 15 minutes. Timing precision is ±15 minutes. Late runs are fine — sent markers claim once per owner/day.",
      vercelLimits:
        "Vercel Cron: Hobby may limit cron frequency (often 1×/day); Pro supports intervals like every 15 minutes. maxDuration 60s on this route.",
    },
    result,
  });
}
