import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { recordActivity } from "@/lib/db/activity";
import { findBusinessByWhatsapp, findOwnerByPhone, updateOwnerNotificationPrefs } from "@/lib/db/queries";
import { parseStopStart } from "@/lib/notification-prefs";
import { answerWhatsAppQuestion } from "@/lib/whatsapp-qa";
import { downloadTwilioMedia, sendWhatsApp, transcribeAudio, twilioConfigured, verifyTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDbReady();
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(request.url, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From || "";
  const body = String(params.Body || "").trim();
  const numMedia = Number(params.NumMedia || 0);
  const mediaUrl = numMedia > 0 ? String(params.MediaUrl0 || "") : "";
  const mediaType = numMedia > 0 ? String(params.MediaContentType0 || "") : "";

  const phone = from.replace(/^whatsapp:/i, "");
  const business = await findBusinessByWhatsapp(phone);

  // STOP / START — pause or resume non-essential messages (OTP never affected)
  const stopStart = parseStopStart(body);
  if (stopStart && business) {
    const owner = await findOwnerByPhone(business.id, phone);
    if (owner) {
      if (stopStart === "stop") {
        await updateOwnerNotificationPrefs(business.id, owner.id, { pauseAll: true });
        await recordActivity(business.id, {
          category: "settings",
          action: "settings_changed",
          actor: {
            phone: owner.phone,
            name: owner.name,
            role: owner.access === "co" ? "co_owner" : "equal_owner",
          },
          summary: `${owner.name} turned: Paused all (WhatsApp STOP)`,
        }).catch(() => undefined);
        await persistDb();
        const msg =
          business.language === "ur"
            ? "ٹھیک ہے — غیر ضروری پیغامات بند کر دیے گئے۔ START بھیجیں تو دوبارہ شروع ہوں گے۔"
            : "Got it — non-essential messages paused. Reply START to resume.";
        if (twilioConfigured()) await sendWhatsApp(phone, msg).catch(() => null);
        return twiml(msg);
      }
      await updateOwnerNotificationPrefs(business.id, owner.id, { pauseAll: false });
      await recordActivity(business.id, {
        category: "settings",
        action: "settings_changed",
        actor: {
          phone: owner.phone,
          name: owner.name,
          role: owner.access === "co" ? "co_owner" : "equal_owner",
        },
        summary: `${owner.name} turned: Resumed all (WhatsApp START)`,
      }).catch(() => undefined);
      await persistDb();
      const msg =
        business.language === "ur"
          ? "ٹھیک ہے — پیغامات دوبارہ شروع ہیں۔"
          : "Got it — messages resumed.";
      if (twilioConfigured()) await sendWhatsApp(phone, msg).catch(() => null);
      return twiml(msg);
    }
  }

  let question = body;
  if ((!question || mediaType.startsWith("audio/")) && mediaUrl) {
    try {
      const media = await downloadTwilioMedia(mediaUrl);
      const transcript = await transcribeAudio(media.buf, media.contentType);
      if (transcript) question = transcript;
    } catch (err) {
      console.error("[twilio webhook] voice failed", err);
    }
  }

  if (!business) {
    const msg =
      "StockPulse: I do not recognize this WhatsApp number. Open Settings in the app and save your owner WhatsApp number first.";
    if (twilioConfigured()) await sendWhatsApp(phone, msg).catch(() => null);
    return twiml(msg);
  }

  if (!question) {
    const msg =
      business.language === "ur"
        ? "آواز یا سوال بھیجیں — مثلاً چاول کتنا ہے؟"
        : "Send a question or voice note — e.g. How much rice do we have?";
    return twiml(msg);
  }

  const answer = await answerWhatsAppQuestion(business, question);
  if (twilioConfigured()) {
    await sendWhatsApp(phone, answer).catch((err) => console.error(err));
  }
  return twiml(answer);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Twilio WhatsApp webhook. Point the sandbox 'When a message comes in' URL here.",
    twilioConfigured: twilioConfigured(),
  });
}
