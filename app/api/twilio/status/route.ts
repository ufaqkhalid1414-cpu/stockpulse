import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { applyProviderStatus } from "@/lib/outbound";
import { verifyTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio WhatsApp delivery status callback.
 * Configure StatusCallback when sending (see lib/outbound.ts).
 */
export async function POST(request: Request) {
  await ensureDbReady();
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature");
  const url = request.url;
  if (!verifyTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const businessId = new URL(request.url).searchParams.get("businessId") || "";
  const sid = params.MessageSid || params.SmsSid || "";
  const status = params.MessageStatus || params.SmsStatus || "";
  if (!businessId || !sid) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await applyProviderStatus({
    businessId,
    providerSid: sid,
    status,
    errorCode: params.ErrorCode || null,
    errorMessage: params.ErrorMessage || null,
  });
  await persistDb();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Twilio status callback. Point StatusCallback here with ?businessId=…",
  });
}
