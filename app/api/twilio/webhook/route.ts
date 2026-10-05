import { NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/db";
import { findBusinessByWhatsapp } from "@/lib/db/queries";
import { answerWhatsAppQuestion } from "@/lib/whatsapp-qa";
import { downloadTwilioMedia, sendWhatsApp, transcribeAudio, twilioConfigured } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDbReady();
  const form = await request.formData();
  const from = String(form.get("From") || "");
  const body = String(form.get("Body") || "").trim();
  const numMedia = Number(form.get("NumMedia") || 0);
  const mediaUrl = numMedia > 0 ? String(form.get("MediaUrl0") || "") : "";
  const mediaType = numMedia > 0 ? String(form.get("MediaContentType0") || "") : "";

  const phone = from.replace(/^whatsapp:/i, "");
  const business = await findBusinessByWhatsapp(phone);

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
