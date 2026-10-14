import { jsonNoStore } from "@/lib/api-response";
import { databaseIsDurable, ensureDbReady, usingFirestore } from "@/lib/db";
import { listBusinesses } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

/**
 * Public readiness probe — stays reachable without auth (per Prompt 14 the only
 * fully public routes are the landing page, /login, /privacy, /terms, and this
 * health check). Unauthenticated callers only get {ok, durable}: no business
 * count or database vendor name, which would leak account-scale information.
 * Full detail (business count, blob config, backup storage) requires CRON_SECRET.
 */
export async function GET(request: Request) {
  const authorized = hasCronSecret(request);
  try {
    await ensureDbReady();
    if (!authorized) {
      return jsonNoStore({ ok: true, durable: databaseIsDurable() });
    }
    const businesses = await listBusinesses();
    return jsonNoStore({
      ok: true,
      database: usingFirestore() ? "firestore" : "unset",
      durable: databaseIsDurable(),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      businessCount: businesses.length,
      backups: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local-dir",
    });
  } catch (err) {
    if (!authorized) {
      return jsonNoStore({ ok: false, durable: databaseIsDurable() }, { status: 503 });
    }
    return jsonNoStore(
      {
        ok: false,
        database: usingFirestore() ? "firestore" : "unset",
        durable: databaseIsDurable(),
        error: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}
