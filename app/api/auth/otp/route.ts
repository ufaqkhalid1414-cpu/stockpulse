import { homePathForRole } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { ensureDbReady, persistDb } from "@/lib/db";
import { findMembershipByPhone } from "@/lib/db/queries";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import {
  createOtp,
  createSession,
  otpDevModeEnabled,
  resolveBusinessForPhone,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyOtp,
} from "@/lib/session";
import { INVITE_ONLY_MESSAGE, publicSignupAllowed } from "@/lib/public-access";
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
        return jsonNoStore(
          { error: "Enter a WhatsApp number with country code, e.g. +92 300 1234567" },
          { status: 400 },
        );
      }

      let code: string;
      try {
        ({ code } = await createOtp(phone));
      } catch (err) {
        logWarn("otp_request_failed", { phone, reason: err instanceof Error ? err.message : "rate_limited" });
        return jsonNoStore(
          { error: err instanceof Error ? err.message : "Could not create code" },
          { status: 429 },
        );
      }

      const message = `StockPulse login code: ${code}\n\nThis code expires in 10 minutes. Do not share it.`;

      if (twilioConfigured()) {
        try {
          await sendWhatsApp(phone, message);
        } catch (err) {
          logWarn("otp_request_failed", { phone, reason: "twilio_send_error" });
          return jsonNoStore(
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
        logInfo("otp_requested", { phone, method: "whatsapp" }); // code itself is never logged
        return jsonNoStore({ ok: true, sent: true });
      }

      if (otpDevModeEnabled()) {
        // Never log the OTP code itself — the UI reads it from `devCode` below.
        logInfo("otp_requested", { phone, method: "dev_mode" });
        await persistDb();
        return jsonNoStore({
          ok: true,
          sent: false,
          devCode: code,
          warning: "Twilio is not configured. Use the on-screen code (dev mode only).",
        });
      }

      logWarn("otp_request_failed", { phone, reason: "whatsapp_not_configured" });
      return jsonNoStore(
        { error: "WhatsApp login is not configured on this server yet (missing Twilio credentials)." },
        { status: 503 },
      );
    }

    if (body.action === "verify") {
      const phone = normalizePhone(String(body.phone || ""));
      const code = String(body.code || "").trim();
      if (!isValidPhone(phone)) {
        return jsonNoStore({ error: "Enter a valid WhatsApp number with country code." }, { status: 400 });
      }
      if (!/^\d{6}$/.test(code)) {
        return jsonNoStore({ error: "Enter the 6-digit code from WhatsApp." }, { status: 400 });
      }
      // `code` is a request body value only — it is never passed to the logger below.
      if (!await verifyOtp(phone, code)) {
        logWarn("otp_verify_failed", { phone });
        return jsonNoStore({ error: "That code is wrong or expired. Request a new one." }, { status: 401 });
      }

      const existing = await resolveBusinessForPhone(phone);
      const membership = await findMembershipByPhone(phone);
      if (!publicSignupAllowed() && !membership) {
        logWarn("otp_invite_only_blocked", { phone });
        return jsonNoStore({ error: INVITE_ONLY_MESSAGE }, { status: 403 });
      }
      const created = await createSession(phone, existing?.id ?? null, {
        name: membership?.name ?? null,
        role: membership?.role ?? null,
      });
      await persistDb();
      logInfo("otp_verified", { phone, businessId: existing?.id ?? null, role: membership?.role ?? null });

      const res = jsonNoStore({
        ok: true,
        authenticated: true,
        needsSetup: !existing,
        phone,
        businessId: existing?.id ?? null,
        role: membership?.role ?? null,
        homePath: membership ? homePathForRole(membership.role) : "/",
      });
      // Set cookie on the response explicitly so browsers always persist it.
      res.cookies.set(SESSION_COOKIE, created.token, created.cookieOptions ?? sessionCookieOptions());
      return res;
    }

    return jsonNoStore({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    logError("otp_route_error", {}, err);
    return jsonNoStore(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      { status: 500 },
    );
  }
}
