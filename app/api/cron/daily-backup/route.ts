import { NextResponse } from "next/server";
import { ensureDbReady, persistDb, usingTurso } from "@/lib/db";
import { runDailyBackups } from "@/lib/db/queries";

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

/**
 * Vercel Cron: daily full database snapshot per business into separate Blob/local storage.
 * Schedule in vercel.json: "15 2 * * *" (02:15 UTC every day).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
  const results = await runDailyBackups();
  await persistDb();

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;

  return NextResponse.json({
    ok: failed === 0,
    schedule: "daily (Vercel Cron 15 2 * * *)",
    storage: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local-backups-dir",
    database: usingTurso() ? "turso" : "local-file",
    backedUp: ok,
    failed,
    results,
  });
}
