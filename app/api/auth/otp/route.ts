import { NextResponse } from "next/server";
import { homePathForRole } from "@/lib/access";
import { ensureDbReady, persistDb } from "@/lib/db";
import { findMembershipByPhone } from "@/lib/db/queries";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import {
  createOtp,
  createSession,
  otpDevModeEnabled,
  resolveBusinessForPhone,
  verifyOtp,
} from "@/lib/session";
import { sendWhatsApp, twilioConfigured } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDbReady();
  const body = (await request.json()) as {
    action?: "request" | "verify";
    phone?: string;
    code?: string;
  };

  try {
    if (body.action === "request") {
      const phone = normalizePhone(String(body.phone || ""));
      if (!isValidPhone(phone)) {
        return NextResponse.json(
          { error: "Enter a WhatsApp number with country code, e.g. +92 300 1234567" },
          { status: 400 },
        );
      }

      let code: string;
      try {
        ({ code } = await createOtp(phone));
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Could not create code" },
          { status: 429 },
        );
      }

      const message = `StockPulse login code: ${code}\n\nThis code expires in 10 minutes. Do not share it.`;

      if (twilioConfigured()) {
        try {
          await sendWhatsApp(phone, message);
        } catch (err) {
          return NextResponse.json(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Could not send WhatsApp code. Check the number and Twilio sandbox.",
            },
            { status: 502 },
          );
        }
        await persistDb();
        return NextResponse.json({ ok: true, sent: true });
      }

      if (otpDevModeEnabled()) {
        console.warn("[otp] Twilio not configured — DEV code for", phone, "→", code);
        await persistDb();
        return NextResponse.json({
          ok: true,
          sent: false,
          devCode: code,
          warning: "Twilio is not configured. Use the on-screen code (dev mode only).",
        });
      }

      return NextResponse.json(
        { error: "WhatsApp login is not configured on this server yet (missing Twilio credentials)." },
        { status: 503 },
      );
    }

    if (body.action === "verify") {
      const phone = normalizePhone(String(body.phone || ""));
      const code = String(body.code || "").trim();
      if (!isValidPhone(phone)) {
        return NextResponse.json({ error: "Enter a valid WhatsApp number with country code." }, { status: 400 });
      }
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "Enter the 6-digit code from WhatsApp." }, { status: 400 });
      }
      if (!await verifyOtp(phone, code)) {
        return NextResponse.json({ error: "That code is wrong or expired. Request a new one." }, { status: 401 });
      }

      const existing = await resolveBusinessForPhone(phone);
      await createSession(phone, existing?.id ?? null);
      await persistDb();

      const membership = await findMembershipByPhone(phone);

      return NextResponse.json({
        ok: true,
        authenticated: true,
        needsSetup: !existing,
        phone,
        businessId: existing?.id ?? null,
        role: membership?.role ?? null,
        homePath: membership ? homePathForRole(membership.role) : "/",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/auth/otp]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      { status: 500 },
    );
  }
}
