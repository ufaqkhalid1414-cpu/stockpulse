"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function LandingPage() {
  const { state } = useStock();
  const lang = state.language;
  const reduce = useReducedMotion();

  const fade = (delay = 0) =>
    reduce
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="landing-shell relative min-h-dvh overflow-x-hidden">
      <header className="relative z-20 border-b border-navy/10 bg-cream/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <p className="text-base font-bold tracking-tight text-navy">StockPulse</p>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-6 text-sm font-medium text-navy/60 sm:flex" aria-label="Page">
              <a href="#how" className="hover:text-navy">
                {t(lang, "landingNavHow")}
              </a>
              <a href="#why" className="hover:text-navy">
                {t(lang, "landingNavWhy")}
              </a>
            </nav>
            <LanguageMenu align="end" />
            <Button href="/login" className="px-4 py-2.5">
              {t(lang, "landingCta")}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — one composition: brand, headline, support, CTA, product plane */}
      <section className="relative">
        <div className="landing-hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-[1100px] gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-12 lg:pb-20 lg:pt-16">
          <div className="max-w-xl">
            <motion.p
              className="text-[clamp(2.75rem,8vw,4.75rem)] font-bold leading-[0.95] tracking-tight text-navy"
              {...fade(0)}
            >
              StockPulse
            </motion.p>
            <motion.span
              className="mt-4 block h-1 w-16 origin-left rounded-full bg-gold"
              initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduce ? 0 : 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.h1
              className="mt-6 text-xl font-semibold leading-snug text-navy sm:text-2xl"
              {...fade(0.12)}
            >
              {t(lang, "landingHeadline")}
            </motion.h1>
            <motion.p className="mt-3 max-w-md text-base leading-relaxed text-navy/65" {...fade(0.2)}>
              {t(lang, "landingSupport")}
            </motion.p>
            <motion.div className="mt-8 flex flex-wrap items-center gap-3" {...fade(0.28)}>
              <Button href="/login">{t(lang, "landingCta")}</Button>
              <a
                href="#how"
                className="text-sm font-semibold text-navy/60 underline-offset-4 hover:text-navy hover:underline"
              >
                {t(lang, "landingSecondary")}
              </a>
            </motion.div>
          </div>

          <motion.div
            className="relative min-h-[280px] w-full lg:min-h-[340px]"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.65, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden
          >
            <ProductPlane lang={lang} />
          </motion.div>
        </div>
      </section>

      <section id="how" className="border-t border-navy/10 bg-white/40">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">{t(lang, "landingHowTitle")}</h2>
          <p className="mt-3 max-w-xl text-base text-navy/65">{t(lang, "landingHowSupport")}</p>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: "1", title: t(lang, "landingStep1Title"), body: t(lang, "landingStep1Body") },
              { n: "2", title: t(lang, "landingStep2Title"), body: t(lang, "landingStep2Body") },
              { n: "3", title: t(lang, "landingStep3Title"), body: t(lang, "landingStep3Body") },
            ].map((step) => (
              <li key={step.n} className="border-t border-gold/50 pt-5">
                <p className="text-sm font-bold text-gold">{step.n}</p>
                <p className="mt-2 text-lg font-semibold text-navy">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-navy/65">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="why" className="border-t border-navy/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">{t(lang, "landingWhyTitle")}</h2>
          <p className="mt-3 max-w-xl text-base text-navy/65">{t(lang, "landingWhySupport")}</p>
          <ul className="mt-10 grid gap-10 sm:grid-cols-2">
            {[
              { title: t(lang, "landingFeat1Title"), body: t(lang, "landingFeat1Body") },
              { title: t(lang, "landingFeat2Title"), body: t(lang, "landingFeat2Body") },
              { title: t(lang, "landingFeat3Title"), body: t(lang, "landingFeat3Body") },
              { title: t(lang, "landingFeat4Title"), body: t(lang, "landingFeat4Body") },
            ].map((feat) => (
              <li key={feat.title}>
                <p className="text-lg font-semibold text-navy">{feat.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-navy/65">{feat.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-navy/10 bg-navy text-cream">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col items-start justify-between gap-6 px-5 py-14 sm:flex-row sm:items-center sm:px-8">
          <div>
            <p className="text-2xl font-bold tracking-tight">{t(lang, "landingCloseTitle")}</p>
            <p className="mt-2 max-w-md text-sm text-cream/70">{t(lang, "landingCloseSupport")}</p>
          </div>
          <Link
            href="/login"
            className="depth lift inline-flex items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-semibold text-navy"
          >
            {t(lang, "landingCta")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-navy/10 bg-cream">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div>
            <p className="font-bold text-navy">StockPulse</p>
            <p className="mt-1 max-w-sm text-sm text-navy/55">{t(lang, "landingFooter")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-navy/60">
            <Link href="/login" className="hover:text-navy">
              {t(lang, "landingCta")}
            </Link>
            <span className="text-navy/30">·</span>
            <p className="text-navy/45">© {new Date().getFullYear()}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProductPlane({ lang }: { lang: Parameters<typeof t>[0] }) {
  return (
    <div className="landing-product-plane relative h-full min-h-[280px] overflow-hidden rounded-none border-y border-navy/10 bg-gradient-to-br from-[#F3EEE3] via-cream to-[#E8E4D8] lg:rounded-tl-[28px] lg:border lg:border-navy/10">
      <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(217,169,71,0.25), transparent 45%), radial-gradient(circle at 80% 70%, rgba(45,59,94,0.08), transparent 40%)" }} />
      <div className="relative flex h-full flex-col justify-between p-6 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy/45">{t(lang, "landingPlaneLabel")}</p>
          <p className="mt-2 text-2xl font-bold text-navy">{t(lang, "landingPlaneStatus")}</p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { label: t(lang, "landingPlaneWarehouse"), value: "48" },
            { label: t(lang, "landingPlaneShop"), value: "16" },
            { label: t(lang, "landingPlaneOnline"), value: "12" },
          ].map((cell) => (
            <div key={cell.label} className="border-t border-navy/15 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-navy/45">{cell.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-navy">{cell.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm font-medium text-navy/55">{t(lang, "landingPlaneNote")}</p>
      </div>
    </div>
  );
}
