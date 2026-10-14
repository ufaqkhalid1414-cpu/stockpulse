import { NextResponse } from "next/server";

/**
 * JSON response helper for authenticated / sensitive API routes.
 * Always sets Cache-Control: no-store (+ Pragma for older proxies) so
 * business data, session state, and activity logs are never cached by
 * the browser, a CDN, or an intermediary proxy.
 */
export function jsonNoStore<T>(data: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}
