import { NextResponse } from "next/server";
import { isLastDayOfMonth, sendMonthlyChartsForAllBusinesses } from "@/lib/charts";
import { ensureDbReady, persistDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Local/dev: allow when CRON_SECRET is unset
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
 * Vercel Cron: runs daily on 28–31; handler only sends on the last calendar day (UTC).
 * Schedule in vercel.json: "5 17 28-31 * *" (monthly at month-end, not weekly).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isLastDayOfMonth()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Not the last calendar day of the month (UTC)",
      schedule: "month-end only",
    });
  }

  await ensureDbReady();
  const results = await sendMonthlyChartsForAllBusinesses(baseUrl(request));
  await persistDb();

  return NextResponse.json({
    ok: true,
    skipped: false,
    schedule: "month-end (Vercel Cron 5 17 28-31 * *, last-day gate)",
    results,
  });
}
