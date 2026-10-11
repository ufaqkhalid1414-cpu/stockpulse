import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { BUSINESS_COOKIE, destroySession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  await ensureDbReady();
  await destroySession();
  await persistDb();
  const res = NextResponse.json({ ok: true, authenticated: false, business: null });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(BUSINESS_COOKIE);
  return res;
}
