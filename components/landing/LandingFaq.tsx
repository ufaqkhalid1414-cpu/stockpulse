"use client";

import { useId, useState } from "react";
import { t, type Lang } from "@/lib/i18n";

export type FaqItem = { q: string; a: string };

export function faqItems(lang: Lang): FaqItem[] {
  return [
    { q: t(lang, "landingFaq1Q"), a: t(lang, "landingFaq1A") },
    { q: t(lang, "landingFaq2Q"), a: t(lang, "landingFaq2A") },
    { q: t(lang, "landingFaq3Q"), a: t(lang, "landingFaq3A") },
    { q: t(lang, "landingFaq4Q"), a: t(lang, "landingFaq4A") },
    { q: t(lang, "landingFaq5Q"), a: t(lang, "landingFaq5A") },
    { q: t(lang, "landingFaq6Q"), a: t(lang, "landingFaq6A") },
    { q: t(lang, "landingFaq7Q"), a: t(lang, "landingFaq7A") },
    { q: t(lang, "landingFaq8Q"), a: t(lang, "landingFaq8A") },
    { q: t(lang, "landingFaq9Q"), a: t(lang, "landingFaq9A") },
  ];
}

export function LandingFaq({ lang }: { lang: Lang }) {
  const items = faqItems(lang);
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mt-12 space-y-3">
      {items.map((item, index) => {
        const expanded = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div key={item.q} className="rounded-[16px] border border-[#E4DED2] bg-white shadow-[0_12px_32px_-28px_rgba(24,37,68,0.35)]">
            <button
              type="button"
              id={buttonId}
              className="lift flex w-full items-center justify-between gap-4 rounded-[16px] px-5 py-4 text-start"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen(expanded ? null : index)}
            >
              <span className="text-base font-semibold text-[#25345F]">{item.q}</span>
              <span
                className={`ms-auto shrink-0 text-lg font-semibold text-[#D9A63A] transition-transform duration-200 motion-reduce:transition-none ${
                  expanded ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-base leading-relaxed text-[#70758A]">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FaqJsonLd({ lang }: { lang: Lang }) {
  const items = faqItems(lang);
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
