"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { LandingFooter, LandingHeader } from "@/components/landing/LandingChrome";
import { FaqJsonLd, LandingFaq } from "@/components/landing/LandingFaq";
import {
  DashboardPreview,
  ItemsPreview,
  LowStockPreview,
  PricePreview,
  WhatsAppFloat,
} from "@/components/landing/LandingVisuals";
import { Button } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function LandingPage({ heroBg = null }: { heroBg?: string | null }) {
  const { state } = useStock();
  const lang = state.language;
  const reduce = useReducedMotion();

  const fade = (delay = 0) =>
    reduce
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  const reveal = reduce
    ? { initial: { opacity: 1, y: 0 }, whileInView: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="landing-shell relative min-h-dvh overflow-x-hidden">
      <LandingHeader lang={lang} />
      <FaqJsonLd lang={lang} />

      {/* Hero — full-bleed visual, brand wordmark first */}
      <section className="relative overflow-hidden">
        {heroBg ? (
          <>
            <Image
              src={heroBg}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[rgba(24,37,68,0.62)]" aria-hidden />
          </>
        ) : null}
        <div className="landing-hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-[1180px] gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-8 lg:pb-24 lg:pt-16">
          <div className={`relative z-10 max-w-xl ${heroBg ? "text-[#F7F3EA]" : ""}`}>
            <motion.h1
              className={`font-bold tracking-tight ${
                heroBg ? "text-[#F7F3EA]" : "text-[#25345F]"
              } text-[clamp(2.75rem,8vw,5.25rem)] leading-[0.95]`}
              {...fade(0)}
            >
              StockPulse
            </motion.h1>
            <motion.p
              className={`mt-4 text-[clamp(1.65rem,4.2vw,2.75rem)] font-bold leading-[1.15] tracking-tight ${
                heroBg ? "text-[#F7F3EA]" : "text-[#25345F]"
              }`}
              {...fade(0.08)}
            >
              {t(lang, "landingHeadline")}
            </motion.p>
            <motion.p
              className={`mt-5 text-lg font-semibold leading-snug sm:text-xl ${
                heroBg ? "text-[#F7F3EA]/90" : "text-[#25345F]/90"
              }`}
              {...fade(0.16)}
            >
              {t(lang, "landingSupport")}
            </motion.p>
            <motion.p
              className={`mt-3 max-w-md text-base leading-relaxed ${
                heroBg ? "text-[#F7F3EA]/75" : "text-[#70758A]"
              }`}
              {...fade(0.22)}
            >
              {t(lang, "landingSupportSecondary")}
            </motion.p>
            <motion.div className="mt-9 flex flex-wrap items-center gap-4" {...fade(0.28)}>
              <Button href="/login">{t(lang, "landingCta")}</Button>
              <a
                href="#how"
                className={`text-sm font-semibold underline-offset-4 transition-colors hover:underline ${
                  heroBg ? "text-[#F7F3EA]/80 hover:text-[#F7F3EA]" : "text-[#70758A] hover:text-[#25345F]"
                }`}
              >
                {t(lang, "landingSecondary")}
              </a>
            </motion.div>
          </div>

          <motion.div
            className="relative w-full min-h-[280px] sm:min-h-[340px] lg:min-h-[420px] lg:me-[-12%] lg:w-[112%] lg:max-w-none"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.65, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-preview origin-center scale-[1.02] sm:scale-105 lg:origin-end lg:scale-[1.12]">
              <DashboardPreview lang={lang} />
            </div>
            <motion.div
              className="absolute -bottom-4 start-3 end-3 sm:-bottom-5 sm:start-auto sm:end-[-8px] sm:w-[260px]"
              initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <WhatsAppFloat lang={lang} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Three places */}
      <motion.section className="border-t border-[#E4DED2]" {...reveal}>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <h2 className="max-w-2xl text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingPlacesTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#70758A] sm:text-lg">
            {t(lang, "landingPlacesSupport")}
          </p>
          <div className="mt-14 grid gap-0 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            <PlaceCell lang={lang} label={t(lang, "landingPlaneWarehouse")} value="120" />
            <Connector />
            <PlaceCell lang={lang} label={t(lang, "landingPlaneShop")} value="45" />
            <Connector />
            <PlaceCell lang={lang} label={t(lang, "landingPlaneOnline")} value="28" />
          </div>
        </div>
      </motion.section>

      {/* Three steps */}
      <motion.section className="border-t border-[#E4DED2] bg-white/50" {...reveal}>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <h2 id="how" className="scroll-mt-landing text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingHowTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-base text-[#70758A] sm:text-lg">{t(lang, "landingHowSupport")}</p>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              { n: "01", title: t(lang, "landingStep1Title"), body: t(lang, "landingStep1Body") },
              { n: "02", title: t(lang, "landingStep2Title"), body: t(lang, "landingStep2Body") },
              { n: "03", title: t(lang, "landingStep3Title"), body: t(lang, "landingStep3Body") },
            ].map((step) => (
              <li key={step.n} className="border-t border-[#D9A63A]/55 pt-6">
                <p className="text-sm font-bold tracking-[0.08em] text-[#D9A63A]">{step.n}</p>
                <p className="mt-3 text-xl font-semibold text-[#25345F]">{step.title}</p>
                <p className="mt-3 text-base leading-relaxed text-[#70758A]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </motion.section>

      {/* Features cluster */}
      <div>
        {/* Items showcase */}
        <motion.section className="border-t border-[#E4DED2]" {...reveal}>
          <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-28">
            <div>
              <h2 id="features" className="scroll-mt-landing text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
                {t(lang, "landingItemsTitle")}
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[#70758A] sm:text-lg">
                {t(lang, "landingItemsSupport")}
              </p>
            </div>
            <ItemsPreview lang={lang} />
          </div>
        </motion.section>

        {/* Low stock */}
        <motion.section className="border-t border-[#E4DED2] bg-[#EEE8DA]/35" {...reveal}>
          <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-28">
            <div>
              <h2 className="text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
                {t(lang, "landingLowTitle")}
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[#70758A] sm:text-lg">
                {t(lang, "landingLowSupport")}
              </p>
              <div className="mt-8 max-w-sm">
                <WhatsAppFloat lang={lang} />
              </div>
            </div>
            <LowStockPreview lang={lang} />
          </div>
        </motion.section>

        {/* Price movement */}
        <motion.section className="border-t border-[#E4DED2]" {...reveal}>
          <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:py-28">
            <div>
              <h2 className="text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
                {t(lang, "landingPriceTitle")}
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[#70758A] sm:text-lg">
                {t(lang, "landingPriceSupport")}
              </p>
            </div>
            <PricePreview lang={lang} />
          </div>
        </motion.section>
      </div>

      {/* Staff access */}
      <motion.section className="border-t border-[#E4DED2] bg-white/45" {...reveal}>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <h2 id="staff" className="scroll-mt-landing max-w-2xl text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingStaffTitle")}
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <PermissionPanel
              title={t(lang, "landingStaffOwner")}
              items={[
                { label: t(lang, "landingStaffDash"), ok: true },
                { label: t(lang, "landingStaffPrices"), ok: true },
                { label: t(lang, "landingStaffPeople"), ok: true },
                { label: t(lang, "landingStaffSettings"), ok: true },
                { label: t(lang, "landingStaffReports"), ok: true },
              ]}
            />
            <PermissionPanel
              title={t(lang, "landingStaffStaff")}
              items={[
                { label: t(lang, "landingStaffAdd"), ok: true },
                { label: t(lang, "landingStaffView"), ok: true },
                { label: t(lang, "landingStaffNoDash"), ok: false },
                { label: t(lang, "landingStaffNoPrices"), ok: false },
                { label: t(lang, "landingStaffNoSettings"), ok: false },
              ]}
            />
          </div>
        </div>
      </motion.section>

      {/* Why / made for real shops */}
      <motion.section className="border-t border-[#E4DED2]" {...reveal}>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <h2 id="why" className="scroll-mt-landing text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingWhyTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#70758A] sm:text-lg">
            {t(lang, "landingWhySupport")}
          </p>
          <ul className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {[
              { title: t(lang, "landingFeat1Title"), body: t(lang, "landingFeat1Body") },
              { title: t(lang, "landingFeat2Title"), body: t(lang, "landingFeat2Body") },
              { title: t(lang, "landingFeat3Title"), body: t(lang, "landingFeat3Body") },
              { title: t(lang, "landingFeat4Title"), body: t(lang, "landingFeat4Body") },
            ].map((feat) => (
              <li key={feat.title} className="border-t border-[#E4DED2] pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D9A63A]">{feat.title}</p>
                <p className="mt-3 text-base leading-relaxed text-[#25345F]/85">{feat.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      {/* Shopify — wording only: planned */}
      <motion.section className="border-t border-[#E4DED2] bg-[#EEE8DA]/30" {...reveal}>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-start gap-10 px-5 py-24 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-28">
          <div className="max-w-xl">
            <h2 className="text-[clamp(1.85rem,4vw,2.75rem)] font-bold tracking-tight text-[#25345F]">
              {t(lang, "landingShopifyTitle")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#70758A] sm:text-lg">
              {t(lang, "landingShopifySupport")}
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-[20px] border border-[#E4DED2] bg-white px-6 py-5 shadow-[0_16px_40px_-28px_rgba(24,37,68,0.35)]">
            <span className="text-sm font-bold text-[#25345F]">Shopify</span>
            <span className="text-[#D9A63A]" aria-hidden>
              ↔
            </span>
            <span className="text-sm font-bold text-[#25345F]">StockPulse</span>
          </div>
        </div>
      </motion.section>

      {/* FAQ */}
      <motion.section className="border-t border-[#E4DED2]" {...reveal}>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <h2 id="faq" className="scroll-mt-landing text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight text-[#25345F]">
            {t(lang, "landingFaqTitle")}
          </h2>
          <LandingFaq lang={lang} />
        </div>
      </motion.section>

      {/* Final CTA */}
      <section className="border-t border-[#182544] bg-[#182544] text-[#F7F3EA]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:py-20">
          <div className="max-w-xl">
            <p className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight">{t(lang, "landingCloseTitle")}</p>
            <p className="mt-3 text-base text-[#F7F3EA]/70">{t(lang, "landingCloseSupport")}</p>
          </div>
          <Link
            href="/login"
            className="depth lift inline-flex items-center justify-center rounded-full bg-[#D9A63A] px-7 py-3.5 text-sm font-semibold text-[#182544]"
          >
            {t(lang, "landingCta")}
          </Link>
        </div>
      </section>

      <LandingFooter lang={lang} />
    </div>
  );
}

function PlaceCell({ lang, label, value }: { lang: Lang; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E4DED2] bg-white px-5 py-6 text-center shadow-[0_12px_32px_-28px_rgba(24,37,68,0.4)]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D9A63A]">{label}</p>
      <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-[#25345F]">{value}</p>
      <p className="mt-1 text-sm text-[#70758A]">{t(lang, "landingUnits")}</p>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center py-1 md:px-1" aria-hidden>
      <span className="text-lg font-semibold text-[#D9A63A] md:hidden">↓</span>
      <span className="hidden text-lg font-semibold text-[#D9A63A] md:inline rtl:rotate-180">→</span>
    </div>
  );
}

function PermissionPanel({
  title,
  items,
}: {
  title: string;
  items: { label: string; ok: boolean }[];
}) {
  return (
    <div className="rounded-[20px] border border-[#E4DED2] bg-white px-6 py-6 shadow-[0_16px_40px_-30px_rgba(24,37,68,0.35)]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D9A63A]">{title}</p>
      <ul className="mt-5 space-y-3">
        {items.map((item) => {
          const markClass = item.ok
            ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-[11px] font-bold text-pine"
            : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cream text-[11px] font-bold text-clay";
          const labelClass = item.ok
            ? "font-medium text-navy"
            : "text-navy/50 line-through decoration-navy/20";
          return (
            <li key={`${title}-${item.label}`} className="flex items-center gap-3 text-sm">
              <span className={markClass} aria-hidden="true">
                {item.ok ? "✓" : "×"}
              </span>
              <span className={labelClass}>{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
