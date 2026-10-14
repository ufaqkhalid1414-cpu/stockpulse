/** Per-owner notification preferences (Prompt 18). Defaults: all on. */

export type NotificationPrefs = {
  dailyReport: boolean;
  /** Local wall-clock "HH:mm" (24h). Default 20:00. */
  dailyReportTime: string;
  priceAlerts: boolean;
  lowStockAlerts: boolean;
  recountAlerts: boolean;
  monthlyChart: boolean;
  /** Pause all non-essential messages (STOP). Login OTP never paused. */
  pauseAll: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyReport: true,
  dailyReportTime: "20:00",
  priceAlerts: true,
  lowStockAlerts: true,
  recountAlerts: true,
  monthlyChart: true,
  pauseAll: false,
};

export type NotifiableKind =
  | "daily_report"
  | "monthly_chart"
  | "price_alert"
  | "low_stock_alert"
  | "recount_alert";

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const time = String(src.dailyReportTime ?? src.daily_report_time ?? DEFAULT_NOTIFICATION_PREFS.dailyReportTime);
  return {
    dailyReport: src.dailyReport !== false && src.daily_report !== false,
    dailyReportTime: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : DEFAULT_NOTIFICATION_PREFS.dailyReportTime,
    priceAlerts: src.priceAlerts !== false && src.price_alerts !== false,
    lowStockAlerts: src.lowStockAlerts !== false && src.low_stock_alerts !== false,
    recountAlerts: src.recountAlerts !== false && src.recount_alerts !== false,
    monthlyChart: src.monthlyChart !== false && src.monthly_chart !== false,
    pauseAll: Boolean(src.pauseAll ?? src.pause_all),
  };
}

/** Server-side gate: should this person receive this non-OTP message? */
export function maySendNotification(prefs: NotificationPrefs, kind: NotifiableKind): boolean {
  if (prefs.pauseAll) return false;
  switch (kind) {
    case "daily_report":
      return prefs.dailyReport;
    case "monthly_chart":
      return prefs.monthlyChart;
    case "price_alert":
      return prefs.priceAlerts;
    case "low_stock_alert":
      return prefs.lowStockAlerts;
    case "recount_alert":
      return prefs.recountAlerts;
    default:
      return false;
  }
}

export function parseStopStart(body: string): "stop" | "start" | null {
  const n = String(body || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!n) return null;
  if (n === "stop" || n === "band karo" || n === "بند کرو" || n === "unsubscribe") return "stop";
  if (n === "start" || n === "shuru" || n === "شروع" || n === "resume") return "start";
  return null;
}
