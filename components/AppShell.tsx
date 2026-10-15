"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { LanguageMenu } from "@/components/LanguageMenu";
import { AppLink } from "@/components/ui";
import {
  footerNavLinks,
  isFooterNavActive,
  isMainNavActive,
  mainNavLinksForRole,
} from "@/lib/app-nav";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, error, role, logout } = useStock();
  const lang = state.language;
  const isStaff =
    role === "staff_add" || role === "staff_view" || role === "staff_sell" || role === "staff_move";
  const mainLinks = mainNavLinksForRole(role);
  const footerLinks = footerNavLinks();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    window.location.href = "/login";
  }

  function renderNavPanel() {
    return (
      <>
        <nav className="flex flex-1 flex-col gap-1" aria-label="StockPulse">
          {mainLinks.map((link) => {
            const active = isMainNavActive(pathname, link.href);
            return (
              <AppLink
                key={link.href}
                href={link.href}
                className={`lift flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  active
                    ? "bg-navy/8 font-semibold text-navy"
                    : "font-medium text-navy/60 hover:bg-navy/5 hover:text-navy"
                }`}
              >
                <NavIcon href={link.href} active={active} />
                <span className="min-w-0 truncate">{t(lang, link.key)}</span>
                {active ? (
                  <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                ) : null}
              </AppLink>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-navy/10 pt-4">
          <nav className="flex flex-col gap-1" aria-label={`${t(lang, "navPrivacy")} / ${t(lang, "navContact")}`}>
            {footerLinks.map((link) => {
              const active = isFooterNavActive(pathname, link.href);
              return (
                <AppLink
                  key={link.href}
                  href={link.href}
                  className={`lift flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    active
                      ? "bg-navy/8 font-semibold text-navy"
                      : "font-medium text-navy/55 hover:bg-navy/5 hover:text-navy"
                  }`}
                >
                  <NavIcon href={link.href} active={active} />
                  <span className="min-w-0 truncate">{t(lang, link.key)}</span>
                </AppLink>
              );
            })}
            <button
              type="button"
              className="lift flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-navy/55 hover:bg-navy/5 hover:text-navy"
              onClick={handleLogout}
            >
              <NavIcon href="logout" active={false} />
              <span className="min-w-0 truncate">{t(lang, "logOut")}</span>
            </button>
          </nav>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-e border-navy/10 bg-cream/95 px-3 py-5 backdrop-blur-md md:flex lg:w-60">
        <div className="mb-6 px-3">
          <p className="text-sm font-semibold text-navy/55">StockPulse</p>
          <p className="mt-0.5 truncate text-base font-bold text-navy" title={state.businessName}>
            {state.businessName}
          </p>
          {isStaff ? (
            <p className="mt-0.5 text-xs font-medium text-navy/50">{t(lang, "staffModeLabel")}</p>
          ) : null}
        </div>
        {renderNavPanel()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-navy/10 bg-cream/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? t(lang, "navCloseMenu") : t(lang, "navMenu")}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MenuGlyph open={menuOpen} />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy">{state.businessName}</p>
                {isStaff ? (
                  <p className="text-xs font-medium text-navy/50">{t(lang, "staffModeLabel")}</p>
                ) : null}
              </div>
            </div>
            <div className="ms-auto flex shrink-0 items-center gap-2">
              <LanguageMenu align="end" />
            </div>
          </div>
        </header>

        {/* Mobile drawer */}
        {menuOpen ? (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t(lang, "navMenu")}>
            <button
              type="button"
              className="absolute inset-0 bg-navy/40"
              aria-label={t(lang, "navCloseMenu")}
              onClick={() => setMenuOpen(false)}
            />
            <div
              id={menuId}
              className="absolute inset-y-0 start-0 flex w-[min(18rem,88vw)] flex-col border-e border-navy/10 bg-cream px-3 py-5 shadow-lg pt-[max(1.25rem,env(safe-area-inset-top))]"
            >
              <div className="mb-4 flex items-start justify-between gap-2 px-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy/55">StockPulse</p>
                  <p className="truncate text-base font-bold text-navy">{state.businessName}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy"
                  aria-label={t(lang, "navCloseMenu")}
                  onClick={() => setMenuOpen(false)}
                >
                  <MenuGlyph open />
                </button>
              </div>
              {renderNavPanel()}
            </div>
          </div>
        ) : null}

        <main
          id="page-top"
          className="mx-auto w-full max-w-[1040px] flex-1 px-5 pb-[max(6rem,calc(6rem+env(safe-area-inset-bottom)))] pt-6 sm:px-8"
        >
          {state.isSample && !isStaff ? (
            <div className="mb-4 rounded-xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm text-navy" role="status">
              {t(lang, "sampleBanner")}
            </div>
          ) : null}
          {error ? (
            <div className="mb-4 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-sm text-clay" role="alert">
              <p className="font-semibold">{t(lang, "offlineBanner")}</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="flex flex-col gap-1.5">
      <span className={`block h-0.5 w-4 bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`} />
      <span className={`block h-0.5 w-4 bg-current transition ${open ? "opacity-0" : ""}`} />
      <span className={`block h-0.5 w-4 bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
    </span>
  );
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    className: "shrink-0 opacity-80",
  };
  switch (href) {
    case "/dashboard":
      return (
        <svg {...common}>
          <path d="M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
        </svg>
      );
    case "/items":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "/add-product":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "/low-stock":
      return (
        <svg {...common}>
          <path d="M12 9v4M12 17h.01M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "/staff":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "/settings":
      return (
        <svg {...common}>
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke={stroke} strokeWidth="1.75" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "/privacy":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
        </svg>
      );
    case "/contact":
      return (
        <svg {...common}>
          <path d="M4 6h16v12H4V6Zm0 0 8 7 8-7" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="1.75" />
        </svg>
      );
  }
}
