import { getOwners } from "@/lib/db/queries";
import { maySendNotification, normalizeNotificationPrefs, type NotifiableKind } from "@/lib/notification-prefs";
import { recordAndSendWhatsApp } from "@/lib/outbound";
import { normalizePhone } from "@/lib/phone";
import { claimEventAlertKey } from "@/lib/sent-markers";

/**
 * Instant owner alerts: respect per-person switches + claim once per event key.
 * Never sends to staff.
 */
export async function sendOwnerAlert(input: {
  businessId: string;
  kind: NotifiableKind;
  eventKey: string;
  title: string;
  body: string;
}): Promise<{ sent: number; skipped: number }> {
  const claimed = await claimEventAlertKey({
    businessId: input.businessId,
    eventKey: input.eventKey,
  });
  if (!claimed) return { sent: 0, skipped: 1 };

  const owners = await getOwners(input.businessId);
  let sent = 0;
  let skipped = 0;
  const text = `${input.title}\n${input.body}`;

  for (const owner of owners) {
    const prefs = normalizeNotificationPrefs(owner.notificationPrefs);
    if (!maySendNotification(prefs, input.kind)) {
      skipped += 1;
      continue;
    }
    const phone = normalizePhone(owner.phone);
    if (!phone) {
      skipped += 1;
      continue;
    }
    await recordAndSendWhatsApp({
      businessId: input.businessId,
      toPhone: phone,
      kind: input.kind,
      body: text,
    });
    sent += 1;
  }
  return { sent, skipped };
}
