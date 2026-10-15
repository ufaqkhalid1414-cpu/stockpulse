import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { runScheduledMessages } from "@/lib/scheduled-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

/**
 * Month-end backup tick (28–31 at 18:05 UTC ≈ 23:05 Asia/Karachi).
 * Same handler as daily scheduled-messages: local last-day + 20:00 gate,
 * per-person sent markers. Safe if both crons fire.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
  const result = await runScheduledMessages(baseUrl(request));
  await persistDb();

  return NextResponse.json({
    ok: true,
    skipped: false,
    schedule: "month-end backup (Vercel Cron 5 18 28-31 * *); local last-day + markers via runScheduledMessages",
    result,
  });
}
