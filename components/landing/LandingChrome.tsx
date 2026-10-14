"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageMenu } from "@/components/LanguageMenu";
import { StockPulseLogo } from "@/components/landing/StockPulseLogo";
import { Button } from "@/components/ui";
import { t, type Lang } from "@/lib/i18n";

export type LandingNavItem = { href: string; label: string };

export function landingNavItems(lang: Lang): LandingNavItem[] {
  return [
    { href: "/#how", label: t(lang, "landingNavHow") },
    { href: "/#features", label: t(lang, "landingNavFeatures") },
    { href: "/#staff", label: t(lang, "landingNavStaff") },
    { href: "/#why", label: t(lang, "landingNavWhy") },
    { href: "/#faq", label: t(lang, "landingNavFaq") },
  ];
}

function scrollToHash(href: string) {
  if (!href.includes("#")) return;
  const id = href.split("#")[1];
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LandingHeader({ lang, homeHref = "/" }: { lang: Lang; homeHref?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = landingNavItems(lang);

  function onNavClick(href: string) {
    setMenuOpen(false);
    if (href.startsWith("/#") || href.startsWith("#")) {
      const hash = href.includes("#") ? `#${href.split("#")[1]}` : href;
      if (window.location.pathname === "/" || window.location.pathname === "") {
        window.history.replaceState(null, "", hash);
        // Close the mobile menu first, then scroll so the sticky header offset is stable.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scrollToHash(href));
        });
      }
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#E4DED2]/90 bg-[#F7F3EA]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-[64px] w-full max-w-[1180px] items-center justify-between gap-2 px-4 sm:h-[76px] sm:gap-4 sm:px-8 md:h-[84px]">
        {/* Leave room for Sign in + menu on phones so the logo never overlaps them */}
        <StockPulseLogo href={homeHref} className="min-w-0 flex-1 basis-0 sm:flex-none sm:basis-auto" />

        <nav
          className="hidden items-center gap-3 self-center text-sm font-medium text-[#70758A] xl:gap-5 lg:flex"
          aria-label="Page"
        >
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap transition-colors hover:text-[#25345F]"
              onClick={(event) => {
                if (item.href.includes("#") && (window.location.pathname === "/" || window.location.pathname === "")) {
                  event.preventDefault();
                  onNavClick(item.href);
                }
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div className="hidden sm:flex sm:items-center">
            <LanguageMenu align="end" />
          </div>
          <Button href="/login" className="inline-flex h-9 items-center whitespace-nowrap px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            <span className="sm:hidden">{t(lang, "landingSignIn")}</span>
            <span className="hidden sm:inline">{t(lang, "landingCta")}</span>
          </Button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E4DED2] bg-white text-[#25345F] lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={menuOpen ? t(lang, "landingCloseMenu") : t(lang, "landingMenu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? t(lang, "landingCloseMenu") : t(lang, "landingMenu")}</span>
            <span aria-hidden className="flex flex-col gap-1.5">
              <span className={`block h-0.5 w-4 bg-current transition ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
              <span className={`block h-0.5 w-4 bg-current transition ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-4 bg-current transition ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div id="landing-mobile-nav" className="border-t border-[#E4DED2] bg-[#F7F3EA] px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-3 text-sm font-medium text-[#25345F]" aria-label="Mobile">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  if (item.href.includes("#") && (window.location.pathname === "/" || window.location.pathname === "")) {
                    event.preventDefault();
                    onNavClick(item.href);
                  } else {
                    setMenuOpen(false);
                  }
                }}
              >
                {item.label}
              </a>
            ))}
            <div className="pt-1">
              <LanguageMenu align="start" />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function LandingFooter({ lang }: { lang: Lang }) {
  return (
    <footer className="border-t border-[#E4DED2] bg-[#F7F3EA]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-bold text-[#25345F]">StockPulse</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#70758A]">{t(lang, "landingFooter")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-[#70758A]">
          <a href="/#how" className="hover:text-[#25345F]">
            {t(lang, "landingNavHow")}
          </a>
          <a href="/#why" className="hover:text-[#25345F]">
            {t(lang, "landingNavWhy")}
          </a>
          <Link href="/login" className="hover:text-[#25345F]">
            {t(lang, "landingSignIn")}
          </Link>
          <Link href="/privacy" className="hover:text-[#25345F]">
            {t(lang, "landingPrivacy")}
          </Link>
          <Link href="/terms" className="hover:text-[#25345F]">
            {t(lang, "landingTerms")}
          </Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1180px] px-5 pb-8 text-xs text-[#70758A]/80 sm:px-8">
        <p>© {new Date().getFullYear()} StockPulse</p>
      </div>
    </footer>
  );
}
