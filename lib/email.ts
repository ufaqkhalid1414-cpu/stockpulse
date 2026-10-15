import { emailDeliveryConfigured } from "@/lib/report-delivery";

export type EmailSendResult =
  | { ok: true; id: string }
  | { ok: false; skipped?: boolean; error: string };

/**
 * Send a plain-text email via Resend when configured.
 * Does not invent success — missing config returns a clear skipped/error result.
 */
export async function sendPlainEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = process.env.REPORT_EMAIL_FROM?.trim() || "";
  if (!emailDeliveryConfigured() || !apiKey || !from) {
    return {
      ok: false,
      skipped: true,
      error: "Email delivery is not configured yet. Add RESEND_API_KEY and REPORT_EMAIL_FROM on the server.",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message || `Email provider rejected the send (${res.status}).`,
      };
    }
    return { ok: true, id: String(data.id || "sent") };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email could not be sent.",
    };
  }
}
