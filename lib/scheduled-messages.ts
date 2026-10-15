import { buildDailyReportMessage } from "@/lib/daily-report";
import { sendMonthlyChartsForBusiness } from "@/lib/charts";
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

export type ScheduleRunResult = {
  businesses: number;
  dailySent: number;
  dailySkipped: number;
  monthlySent: number;
  monthlySkipped: number;
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
 * Scheduler tick: find owners due for daily report / month-end chart,
 * claim sent markers, send once. Late runs are fine.
 *
 * On Vercel Hobby the cron fires once daily (see vercel.json). Choose a UTC
 * hour at/after the latest common local send time so default 20:00 Asia/Karachi
 * and other evening times are already due when the job runs.
 */
export async function runScheduledMessages(baseUrl: string, now = new Date()): Promise<ScheduleRunResult> {
  const businesses = await listBusinesses();
  let dailySent = 0;
  let dailySkipped = 0;
  let monthlySent = 0;
  let monthlySkipped = 0;
  let retries = 0;

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

    // Monthly chart: last local day at/after 20:00 — claim once per person+month.
    if (isLastLocalDayOfMonth(now, tz) && isAtOrPastLocalTime(now, tz, "20:00")) {
      const month = localMonthKey(now, tz);
      const duePhones: string[] = [];
      for (const owner of owners) {
        const prefs = await ownerPrefs(business.id, owner.id);
        if (!maySendNotification(prefs, "monthly_chart")) {
          monthlySkipped += 1;
          continue;
        }
        const phone = normalizePhone(owner.phone);
        if (!phone) continue;
        const claimed = await claimSentMarker({
          businessId: business.id,
          personPhone: phone,
          messageType: "monthly_chart",
          period: month,
        });
        if (!claimed) {
          monthlySkipped += 1;
          continue;
        }
        duePhones.push(phone);
      }
      if (duePhones.length > 0) {
        const result = await sendMonthlyChartsForBusiness(
          business.id,
          business.name,
          baseUrl,
          duePhones,
        ).catch(() => null);
        if (result && result.sent > 0) monthlySent += duePhones.length;
        else monthlySkipped += duePhones.length;
      }
    }
  }

  return {
    businesses: businesses.length,
    dailySent,
    dailySkipped,
    monthlySent,
    monthlySkipped,
    retries,
  };
}
