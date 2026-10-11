"use client";

import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function DashboardPreview({ lang }: { lang: Lang }) {
  return (
    <div className="landing-preview relative overflow-hidden rounded-[20px] border border-[#E4DED2] bg-white shadow-[0_28px_60px_-32px_rgba(24,37,68,0.45)]">
      <div className="flex items-center justify-between border-b border-[#E4DED2] bg-[#F7F3EA] px-5 py-3.5">
        <p className="text-sm font-bold tracking-tight text-[#25345F]">{t(lang, "landingPlaneLabel")}</p>
        <span className="inline-flex h-2 w-2 rounded-full bg-[#D9A63A]" aria-hidden />
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-sm font-medium text-[#70758A]">{t(lang, "landingPlaneStatus")}</p>
          <p className="mt-1 text-lg font-semibold text-[#25345F]">{t(lang, "landingPlaneGlance")}</p>
        </div>
        <div className="rounded-2xl border border-[#E4DED2] bg-[#F7F3EA]/80 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#70758A]">
            {t(lang, "landingStockValue")}
          </p>
          <p className="mt-2 text-[clamp(1.75rem,4vw,2.35rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingStockValueSample")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {[
            { label: t(lang, "landingPlaneWarehouse"), value: "120" },
            { label: t(lang, "landingPlaneShop"), value: "45" },
            { label: t(lang, "landingPlaneOnline"), value: "28" },
          ].map((cell) => (
            <div key={cell.label} className="rounded-xl border border-[#E4DED2] bg-white px-2.5 py-3 sm:px-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#70758A] sm:text-[11px]">
                {cell.label}
              </p>
              <p className="mt-1.5 text-xl font-bold tabular-nums text-[#25345F] sm:text-2xl">{cell.value}</p>
              <p className="mt-0.5 text-[10px] text-[#70758A]">{t(lang, "landingUnits")}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#E4DED2] px-3.5 py-3">
            <p className="text-xs font-semibold text-[#D9A63A]">{t(lang, "landingNeedsAttention")}</p>
            <p className="mt-1 text-sm font-medium text-[#25345F]">{t(lang, "landingLowProducts")}</p>
          </div>
          <div className="rounded-xl border border-[#E4DED2] px-3.5 py-3">
            <p className="text-xs font-semibold text-[#70758A]">{t(lang, "landingRecentPrices")}</p>
            <p className="mt-1 text-sm font-medium text-[#25345F]">{t(lang, "landingPricesChanged")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppFloat({ lang, className = "" }: { lang: Lang; className?: string }) {
  return (
    <div
      className={`landing-wa-float rounded-2xl border border-[#E4DED2] bg-white px-4 py-3 shadow-[0_16px_40px_-24px_rgba(24,37,68,0.55)] ${className}`}
      aria-hidden
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF3E7] text-xs font-bold text-[#1E4630]">
          WA
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#25345F]">{t(lang, "landingWaAlertTitle")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#70758A]">{t(lang, "landingWaAlertBody")}</p>
        </div>
      </div>
    </div>
  );
}

export function ItemsPreview({ lang }: { lang: Lang }) {
  const rows = [
    { name: "Classic Black Shirt", w: 40, s: 12, o: 8 },
    { name: "Cotton Trousers", w: 25, s: 7, o: 4 },
  ];
  return (
    <div className="landing-preview overflow-hidden rounded-[20px] border border-[#E4DED2] bg-white shadow-[0_24px_48px_-28px_rgba(24,37,68,0.35)]">
      <div className="border-b border-[#E4DED2] px-5 py-4">
        <p className="text-lg font-bold text-[#25345F]">{t(lang, "landingItemsLabel")}</p>
        <div className="mt-3 rounded-xl border border-[#E4DED2] bg-[#F7F3EA]/70 px-3.5 py-2.5 text-sm text-[#70758A]">
          {t(lang, "landingItemsSearch")}
        </div>
      </div>
      <ul className="divide-y divide-[#E4DED2]">
        {rows.map((row) => {
          const total = row.w + row.s + row.o;
          return (
            <li key={row.name} className="px-5 py-4">
              <p className="font-semibold text-[#25345F]">{row.name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#70758A]">{t(lang, "landingPlaneWarehouse")}</dt>
                  <dd className="font-semibold tabular-nums text-[#25345F]">{row.w}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#70758A]">{t(lang, "landingPlaneShop")}</dt>
                  <dd className="font-semibold tabular-nums text-[#25345F]">{row.s}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#70758A]">{t(lang, "landingPlaneOnline")}</dt>
                  <dd className="font-semibold tabular-nums text-[#25345F]">{row.o}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#70758A]">{t(lang, "landingTotal")}</dt>
                  <dd className="font-bold tabular-nums text-[#25345F]">{total}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LowStockPreview({ lang }: { lang: Lang }) {
  const items = [
    { name: "Classic Black Shirt", count: 4 },
    { name: "Leather Wallet", count: 3 },
    { name: "Cotton Trousers", count: 6 },
  ];
  return (
    <div className="landing-preview overflow-hidden rounded-[20px] border border-[#E4DED2] bg-white shadow-[0_24px_48px_-28px_rgba(24,37,68,0.35)]">
      <div className="border-b border-[#E4DED2] bg-[#F7F3EA]/80 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D9A63A]">{t(lang, "landingLowLabel")}</p>
      </div>
      <ul className="divide-y divide-[#E4DED2]">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-4 px-5 py-4">
            <p className="font-semibold text-[#25345F]">{item.name}</p>
            <p className="shrink-0 text-sm font-bold tabular-nums text-[#B4552E]/90">
              {t(lang, "landingLowLeft", { count: item.count })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricePreview({ lang }: { lang: Lang }) {
  const prices = ["Rs 1,250", "Rs 1,320", "Rs 1,380"];
  return (
    <div className="landing-preview overflow-hidden rounded-[20px] border border-[#E4DED2] bg-white p-5 shadow-[0_24px_48px_-28px_rgba(24,37,68,0.35)] sm:p-6">
      <p className="text-lg font-bold text-[#25345F]">{t(lang, "landingPlaneNote")}</p>
      <p className="mt-1 text-sm text-[#70758A]">{t(lang, "landingPurchasePrice")}</p>
      <ol className="mt-6 space-y-0">
        {prices.map((price, i) => (
          <li key={price} className="flex flex-col items-start">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-[#25345F]">{price}</p>
            {i < prices.length - 1 ? (
              <span className="my-1.5 pl-1 text-sm font-semibold text-[#D9A63A]" aria-hidden>
                ↓
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs font-medium text-[#70758A]">{t(lang, "landingPriceHistory")}</p>
    </div>
  );
}
