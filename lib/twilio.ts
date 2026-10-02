const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const FROM = process.env.TWILIO_WHATSAPP_FROM || ""; // e.g. whatsapp:+14155238886

export function twilioConfigured() {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM);
}

function authHeader() {
  return `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`;
}

export async function sendWhatsApp(to: string, body: string, mediaUrl?: string) {
  if (!twilioConfigured()) {
    console.warn("[twilio] missing credentials — message not sent:", body.slice(0, 120));
    return { ok: false as const, skipped: true as const, sid: null, error: "Twilio is not configured" };
  }
  const dest = to.startsWith("whatsapp:") ? to : `whatsapp:${to.replace(/\s/g, "")}`;
  const params = new URLSearchParams();
  params.set("To", dest);
  params.set("From", FROM.startsWith("whatsapp:") ? FROM : `whatsapp:${FROM}`);
  params.set("Body", body);
  if (mediaUrl) params.append("MediaUrl", mediaUrl);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message || `WhatsApp send failed (${res.status}). Check the number and Twilio sandbox limits.`);
  }
  return { ok: true as const, skipped: false as const, sid: json.sid ?? null, error: null };
}

export async function downloadTwilioMedia(url: string) {
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buf, contentType };
}

export async function transcribeAudio(buf: Buffer, contentType: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buf)], { type: contentType });
  form.append("file", blob, "voice.ogg");
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper failed: ${text}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text || "").trim() || null;
}
