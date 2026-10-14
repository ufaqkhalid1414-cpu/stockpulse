/** Business timezone helpers (default Asia/Karachi). */

export const DEFAULT_TIMEZONE = "Asia/Karachi";

/** Local date YYYY-MM-DD in `timeZone`. */
export function localDateKey(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Local month key YYYY-MM. */
export function localMonthKey(now: Date, timeZone: string): string {
  return localDateKey(now, timeZone).slice(0, 7);
}

/** Local HH:mm (24h) in `timeZone`. */
export function localTimeHm(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** True when local clock is at or past `HH:mm` (same calendar day). */
export function isAtOrPastLocalTime(now: Date, timeZone: string, hhmm: string): boolean {
  const current = localTimeHm(now, timeZone);
  return current >= (hhmm || "20:00");
}

/** Last calendar day of the month in the given timezone. */
export function isLastLocalDayOfMonth(now: Date, timeZone: string): boolean {
  const key = localDateKey(now, timeZone);
  const [y, m, d] = key.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const tomorrow = new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = localDateKey(tomorrow, timeZone);
  return tomorrowKey.slice(0, 7) !== key.slice(0, 7);
}
