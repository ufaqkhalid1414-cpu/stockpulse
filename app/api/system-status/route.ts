import { NextResponse } from "next/server";
import { requireOwnerAccess } from "@/lib/access";
import { ensureDbReady } from "@/lib/db";
import { twilioConfigured } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only plain-language health for Settings → System Status.
 * No technical jargon, error codes, or external dashboard links.
 */
export async function GET() {
  const ctx = await requireOwnerAccess();
  if (!ctx) {
    return NextResponse.json({ error: "Please log in as an owner" }, { status: 403 });
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

  return NextResponse.json({
    database: {
      ok: databaseOk,
      label: "Database",
      detail: databaseOk ? "Connected" : "Not connected",
      hint: databaseOk ? null : "Your saved stock data isn't reachable right now.",
    },
    whatsapp: {
      ok: whatsappOk,
      label: "WhatsApp",
      detail: whatsappOk ? "Connected" : "Not connected",
      hint: whatsappOk ? null : "WhatsApp isn't connected right now",
    },
    lastBackup: {
      ok: Boolean(lastBackup),
      label: "Last backup",
      at: lastBackup,
      detail: lastBackup ? null : "No backup yet",
      hint: lastBackup ? null : "You don't have a backup yet — tap Back up now in Settings.",
    },
  });
}
