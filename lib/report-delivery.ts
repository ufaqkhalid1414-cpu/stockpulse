/** Manual “today’s report” delivery channel (Settings test button). */

export type ReportChannel = "whatsapp" | "email";

export function normalizeReportChannel(raw: unknown): ReportChannel | null {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "whatsapp" || value === "email") return value;
  return null;
}

/** Resend (or compatible) — server-side only; never claim send without these. */
export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.REPORT_EMAIL_FROM?.trim());
}

export function resolveReportEmailRecipient(sessionEmail: string | null | undefined): string | null {
  const email = String(sessionEmail || "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
