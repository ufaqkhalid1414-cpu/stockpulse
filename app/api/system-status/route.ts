import { requireOwnerAccess } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { ensureDbReady, usingFirestore } from "@/lib/db";
import { outboundStatsToday } from "@/lib/outbound";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { twilioConfigured } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only plain-language health for Settings → System Status.
 * No technical jargon, error codes, or external dashboard links.
 */
export async function GET() {
  const ctx = await requireOwnerAccess("System status");
  if (!ctx) {
    return jsonNoStore({ error: "Please log in as an owner" }, { status: 403 });
  }

  let databaseOk = false;
  try {
    await ensureDbReady();
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const whatsappOk = twilioConfigured();
  const lastBackup = ctx.business.last_backup;
  const provider = usingFirestore() ? "firebase" : "unknown";
  const tz = (ctx.business as { timezone?: string }).timezone || DEFAULT_TIMEZONE;

  let delivery = {
    sent: 0,
    failed: 0,
    windowClosed: 0,
    lastFailReason: null as string | null,
    summary: "No WhatsApp messages recorded today.",
    notDelivering: false,
  };
  try {
    const stats = await outboundStatsToday(ctx.business.id, tz);
    const parts: string[] = [];
    if (stats.sent > 0) parts.push(`${stats.sent} sent`);
    if (stats.failed > 0) parts.push(`${stats.failed} failed`);
    if (stats.windowClosed > 0) parts.push(`${stats.windowClosed} window closed`);
    const summary =
      parts.length > 0
        ? `WhatsApp messages today: ${parts.join(", ")}.`
        : "No WhatsApp messages recorded today.";
    const reason =
      stats.windowClosed > 0
        ? "Window closed"
        : stats.lastFailReason
          ? stats.lastFailReason
          : null;
    const notDelivering =
      whatsappOk && stats.sent === 0 && (stats.failed > 0 || stats.windowClosed > 0);
    delivery = {
      sent: stats.sent,
      failed: stats.failed,
      windowClosed: stats.windowClosed,
      lastFailReason: reason,
      summary: notDelivering
        ? "WhatsApp is not delivering. Reports are not reaching you."
        : reason && (stats.failed > 0 || stats.windowClosed > 0)
          ? `${summary} ${reason === "Window closed" ? "One reason: Window closed." : `One reason: ${reason}.`}`
          : summary,
      notDelivering,
    };
  } catch {
    /* keep defaults */
  }

  return jsonNoStore({
    database: {
      ok: databaseOk,
      label: "Database",
      provider,
      detail: databaseOk ? (provider === "firebase" ? "Firebase connected" : "Connected") : "Not connected",
      hint: databaseOk ? null : "Your saved stock data isn't reachable right now (Firebase).",
    },
    whatsapp: {
      ok: whatsappOk && !delivery.notDelivering,
      label: "WhatsApp",
      detail: whatsappOk ? "Connected" : "Not connected",
      hint: !whatsappOk
        ? "WhatsApp isn't connected right now"
        : delivery.notDelivering
          ? "WhatsApp is not delivering. Reports are not reaching you."
          : null,
    },
    lastBackup: {
      ok: Boolean(lastBackup),
      label: "Last backup",
      at: lastBackup,
      detail: lastBackup ? null : "No backup yet",
      hint: lastBackup ? null : "You don't have a backup yet — tap Back up now in Settings.",
    },
    delivery,
  });
}
