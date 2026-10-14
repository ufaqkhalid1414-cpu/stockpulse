import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthUrl, googleOAuthConfigured } from "@/lib/auth-accounts";
import { jsonNoStore } from "@/lib/api-response";

export const runtime = "nodejs";

const GOOGLE_STATE_COOKIE = "stockpulse_google_oauth";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET() {
  if (!googleOAuthConfigured()) {
    const url = new URL("/login", appOrigin());
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(GOOGLE_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(googleAuthUrl(state));
}

/** Optional JSON probe so the UI can disable the button when Google is not configured. */
export async function POST() {
  return jsonNoStore({ configured: googleOAuthConfigured() });
}
