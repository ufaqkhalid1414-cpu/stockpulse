import { intlLocale, monthLabel, t, type Lang } from "@/lib/i18n";

const qtyFormat = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

export function formatQty(value: number) {
  return qtyFormat.format(value);
}

export function formatMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const hasFraction = Math.abs(rounded - Math.round(rounded)) > 0.001;
  const amount = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `Rs ${amount}`;
}

export function formatPct(value: number) {
  return `${Math.abs(value).toFixed(1)}%`;
}

export function formatMonth(key: string, lang: Lang) {
  return monthLabel(lang, key);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatWhen(iso: string, lang: Lang) {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale[lang], {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  if (sameDay(date, new Date())) return t(lang, "todayAt", { time });
  return new Intl.DateTimeFormat(intlLocale[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatAdded(iso: string, lang: Lang) {
  const date = new Intl.DateTimeFormat(intlLocale[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
  return t(lang, "added", { date });
}
