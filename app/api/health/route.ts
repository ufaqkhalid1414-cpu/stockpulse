import { NextResponse } from "next/server";
import { databaseIsDurable, ensureDbReady, usingTurso } from "@/lib/db";
import { listBusinesses } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight readiness probe — no secrets. Used to confirm durable DB after deploy. */
export async function GET() {
  try {
    await ensureDbReady();
    const businesses = await listBusinesses();
    return NextResponse.json({
      ok: true,
      database: usingTurso() ? "turso" : "local-file",
      durable: databaseIsDurable(),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      businessCount: businesses.length,
      backups: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local-dir",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: usingTurso() ? "turso" : "local-file",
        durable: databaseIsDurable(),
        error: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}
