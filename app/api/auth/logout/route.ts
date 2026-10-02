import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  await ensureDbReady();
  await destroySession();
  await persistDb();
  return NextResponse.json({ ok: true, authenticated: false, business: null });
}
