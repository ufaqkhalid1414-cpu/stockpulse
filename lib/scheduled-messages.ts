import { buildDailyReportMessage } from "@/lib/daily-report";
import { buildBusinessState, getOwners, listBusinesses, type BusinessRow } from "@/lib/db/queries";
import { normalizeNotificationPrefs, maySendNotification } from "@/lib/notification-prefs";
import { recordAndSendWhatsApp, retryDueOutbound } from "@/lib/outbound";
import { claimSentMarker } from "@/lib/sent-markers";
import {
  DEFAULT_TIMEZONE,
  isAtOrPastLocalTime,
  isLastLocalDayOfMonth,
  localDateKey,
  localMonthKey,
} from "@/lib/timezone";
import { normalizePhone } from "@/lib/phone";
import { firestoreDb } from "@/lib/db";
import { sendMonthlyChartsForAllBusinesses } from "@/lib/charts";

export type ScheduleRunResult = {
  businesses: number;
  dailySent: number;
  dailySkipped: number;
  monthlyTriggered: boolean;
  retries: number;
};

function businessTimezone(business: BusinessRow): string {
  return (business as BusinessRow & { timezone?: string }).timezone || DEFAULT_TIMEZONE;
}

async function ownerPrefs(businessId: string, ownerId: string) {
  const snap = await firestoreDb().collection("businesses").doc(businessId).collection("owners").doc(ownerId).get();
  return normalizeNotificationPrefs(snap.exists ? snap.data()?.notificationPrefs : null);
}

/**
 * Frequent cron tick: find owners due for daily report / month-end chart,
 * claim sent markers, send once. Late runs are fine.
 */
export async function runScheduledMessages(baseUrl: string, now = new Date()): Promise<ScheduleRunResult> {
  const businesses = await listBusinesses();
  let dailySent = 0;
  let dailySkipped = 0;
  let retries = 0;
  const monthlyDueBusinessIds: string[] = [];

  for (const business of businesses) {
    const tz = businessTimezone(business);
    retries += await retryDueOutbound(business.id, now.getTime()).catch(() => 0);

    const owners = await getOwners(business.id);
    const state = await buildBusinessState(business.id);
    if (!state) continue;

    const periodDay = localDateKey(now, tz);
    for (const owner of owners) {
      const prefs = await ownerPrefs(business.id, owner.id);
      if (!maySendNotification(prefs, "daily_report")) {
        dailySkipped += 1;
        continue;
      }
      if (!isAtOrPastLocalTime(now, tz, prefs.dailyReportTime)) continue;

      const phone = normalizePhone(owner.phone);
      if (!phone) continue;

      const claimed = await claimSentMarker({
        businessId: business.id,
        personPhone: phone,
        messageType: "daily_report",
        period: periodDay,
      });
      if (!claimed) {
        dailySkipped += 1;
        continue;
      }

      const body = buildDailyReportMessage({
        businessName: state.businessName,
        language: state.language,
        products: state.products,
      });
      await recordAndSendWhatsApp({
        businessId: business.id,
        toPhone: phone,
        kind: "daily_report",
        body,
      });
      dailySent += 1;
    }

    // Monthly chart: last local day at/after 20:00 — claim once per business+month.
    if (isLastLocalDayOfMonth(now, tz) && isAtOrPastLocalTime(now, tz, "20:00")) {
      const month = localMonthKey(now, tz);
      const anyOwnerWantsChart = (
        await Promise.all(owners.map(async (o) => maySendNotification(await ownerPrefs(business.id, o.id), "monthly_chart")))
      ).some(Boolean);
      if (!anyOwnerWantsChart) continue;
      const claimed = await claimSentMarker({
        businessId: business.id,
        personPhone: "business",
        messageType: "monthly_chart_batch",
        period: month,
      });
      if (claimed) monthlyDueBusinessIds.push(business.id);
    }
  }

  let monthlyTriggered = false;
  if (monthlyDueBusinessIds.length > 0) {
    // Existing helper sends all businesses; markers prevent a second tick from re-entering.
    // Only invoke when at least one business just claimed this period.
    await sendMonthlyChartsForAllBusinesses(baseUrl).catch(() => undefined);
    monthlyTriggered = true;
  }

  return {
    businesses: businesses.length,
    dailySent,
    dailySkipped,
    monthlyTriggered,
    retries,
  };
}
