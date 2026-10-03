"use client";

import { usePathname } from "next/navigation";
import { LanguageMenu } from "@/components/LanguageMenu";
import { AppLink, Button } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, error, role, logout } = useStock();
  const lang = state.language;
  const isStaff = role === "staff_add" || role === "staff_view";
  const canAdd = role === "equal_owner" || role === "co_owner" || role === "staff_add";

  const links = isStaff
    ? role === "staff_view"
      ? ([{ href: "/items", key: "navStock" as const }] as const)
      : ([
          { href: "/add-product", key: "addProduct" as const },
          { href: "/items", key: "navStock" as const },
        ] as const)
    : ([
        { href: "/dashboard", key: "navDashboard" as const },
        { href: "/staff", key: "navPeople" as const },
        { href: "/settings", key: "navSettings" as const },
      ] as const);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-navy/10 bg-cream/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-[1040px] px-5 sm:px-8">
          <div className="flex items-start justify-between gap-3 pt-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy/55">StockPulse</p>
              <p className="truncate text-lg font-bold text-navy sm:text-xl">{state.businessName}</p>
              {isStaff ? (
                <p className="mt-0.5 text-xs font-medium text-navy/50">{t(lang, "staffModeLabel")}</p>
              ) : null}
            </div>
            <LanguageMenu />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-3">
            <nav className="flex gap-5" aria-label="StockPulse">
              {links.map((link) => {
                const active = isActive(pathname, link.href, isStaff);
                return (
                  <AppLink
                    key={link.href}
                    href={link.href}
                    className={`lift inline-flex flex-col items-start rounded-full px-0.5 py-1 text-sm ${
                      active ? "font-semibold text-navy" : "font-medium text-navy/55"
                    }`}
                  >
                    {t(lang, link.key)}
                    <span className={`mt-1 h-0.5 w-full rounded-full ${active ? "bg-gold" : "bg-transparent"}`} />
                  </AppLink>
                );
              })}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              {canAdd && pathname !== "/add-product" && !isStaff ? (
                <Button href="/add-product" className="px-4 py-2.5">
                  {t(lang, "addProduct")}
                </Button>
              ) : null}
              {isStaff ? (
                <Button
                  variant="secondary"
                  className="px-4 py-2.5"
                  onClick={async () => {
                    await logout();
                    window.location.href = "/";
                  }}
                >
                  {t(lang, "logOut")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <main id="page-top" className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-6 sm:px-8">
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
  );
}

function isActive(pathname: string, href: string, isStaff: boolean) {
  if (href === "/dashboard" && !isStaff) {
    return (
      pathname === "/dashboard" ||
      pathname === "/items" ||
      pathname === "/low-stock" ||
      pathname === "/add-product" ||
      pathname.startsWith("/prices")
    );
  }
  return pathname === href;
}
