"use client";

import { LandingFooter, LandingHeader } from "@/components/landing/LandingChrome";
import { termsSections } from "@/lib/legal-content";
import { EFFECTIVE_DATE } from "@/lib/legal-config";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function TermsPage() {
  const { state, ready } = useStock();
  const lang = state.language;
  const sections = termsSections(lang);

  if (!ready) return <div className="min-h-dvh bg-[#F7F3EA]" />;

  return (
    <div className="landing-shell min-h-dvh">
      <LandingHeader lang={lang} />
      <main className="mx-auto w-full max-w-[720px] px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-[clamp(1.85rem,4vw,2.75rem)] font-bold tracking-tight text-[#25345F]">
          {t(lang, "landingTermsTitle")}
        </h1>
        {EFFECTIVE_DATE.trim() ? (
          <p className="mt-3 text-sm text-[#70758A]">
            {t(lang, "landingLegalUpdated", { date: EFFECTIVE_DATE })}
          </p>
        ) : null}
        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="scroll-mt-24">
              <h2 className="text-lg font-bold text-[#25345F]">{section.title}</h2>
              <div className="mt-3 space-y-3 text-base leading-relaxed text-[#70758A]">
                {section.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <LandingFooter lang={lang} />
    </div>
  );
}
