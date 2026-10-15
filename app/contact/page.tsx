"use client";

import { LandingFooter, LandingHeader } from "@/components/landing/LandingChrome";
import { CONTACT_PLACEHOLDER } from "@/lib/app-nav";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

/** Placeholder only — real contact details and actions come later. */
export default function ContactPage() {
  const { state, ready } = useStock();
  const lang = state.language;

  if (!ready) return <div className="min-h-dvh bg-[#F7F3EA]" />;

  return (
    <div className="landing-shell min-h-dvh">
      <LandingHeader lang={lang} />
      <main className="mx-auto w-full max-w-[720px] px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-[clamp(1.85rem,4vw,2.75rem)] font-bold tracking-tight text-[#25345F]">
          {t(lang, "contactTitle")}
        </h1>
        <p className="mt-6 text-base leading-relaxed text-[#70758A]">{t(lang, "contactPlaceholder")}</p>
        {/* Keep message aligned with CONTACT_PLACEHOLDER for tests / future content swap */}
        <span className="sr-only">{CONTACT_PLACEHOLDER}</span>
      </main>
      <LandingFooter lang={lang} />
    </div>
  );
}
