"use client";

import { AppShell } from "@/components/AppShell";
import { ProductPhoto } from "@/components/ProductPhoto";
import { TrendLine } from "@/components/TrendLine";
import { AppLink, CheckIcon, Num, StatusBanner } from "@/components/ui";
import { formatMoney, formatPct, formatWhen } from "@/lib/format";
import { t } from "@/lib/i18n";
import { biggestMoves, changedProducts, lowStockProducts, priceDelta, stockValue, trendSeries } from "@/lib/metrics";
import { useStock } from "@/lib/store";

export default function DashboardPage() {
  const { state } = useStock();
  const lang = state.language;
  const products = state.products;
  const total = stockValue(products);
  const low = lowStockProducts(products);
  const changed = changedProducts(products);
  const moves = biggestMoves(products, 5);
  const status = statusCopy(lang, products.length, changed.length, low.length);

  return (
    <AppShell>
      <StatusBanner title={status.title} support={status.support} />

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-navy/70">
        <p className="inline-flex items-center gap-2">
          {state.lastBackup ? <CheckIcon /> : null}
          <span>
            {state.lastBackup
              ? `${t(lang, "lastBackup")} · ${formatWhen(state.lastBackup, lang)}`
              : t(lang, "noBackup")}
          </span>
        </p>
        <p>
          {state.connectedStores === 0
            ? t(lang, "noStores")
            : state.connectedStores === 1
              ? t(lang, "storesConnectedOne")
              : t(lang, "storesConnected", { count: state.connectedStores })}
        </p>
      </div>

      {state.alerts.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-navy">{t(lang, "alertsTitle")}</h2>
          <ul className="mt-3 space-y-2">
            {state.alerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className="card p-4">
                <p className="font-semibold text-navy">{alert.title}</p>
                <p className="mt-1 text-sm text-navy/65">{alert.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 sm:p-6 lg:col-span-2">
          <p className="text-sm font-medium text-navy/65">{t(lang, "totalStockValue")}</p>
          <p className="mt-3 text-[clamp(2.4rem,8vw,3.75rem)] font-bold leading-none tracking-tight text-navy">
            <Num>{formatMoney(total)}</Num>
          </p>
          {products.length > 0 ? (
            <div className="mt-4">
              <TrendLine values={trendSeries(total)} label={t(lang, "trendLabel")} />
              <p className="mt-1 text-xs text-navy/50">{t(lang, "trendCaption")}</p>
            </div>
          ) : (
            <p className="mt-6 text-sm text-navy/60">{t(lang, "trendEmpty")}</p>
          )}
        </section>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <AppLink href="/items" className="card lift group flex h-full flex-col p-5">
            <p className="text-sm font-medium text-navy/65">{t(lang, "differentItems")}</p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-navy">
              <Num>{products.length}</Num>
            </p>
            <p className="mt-auto pt-4 text-sm font-semibold text-navy/70">
              {t(lang, "view")}{" "}
              <span aria-hidden className="inline-block transition-transform duration-200 group-hover:translate-x-1 rtl:hidden">
                →
              </span>
              <span aria-hidden className="hidden transition-transform duration-200 group-hover:-translate-x-1 rtl:inline-block">
                ←
              </span>
            </p>
          </AppLink>
          <AppLink href="/low-stock" className="card lift group flex h-full flex-col p-5">
            <p className="text-sm font-medium text-navy/65">{t(lang, "lowStock")}</p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-navy">
              <Num>{low.length}</Num>
            </p>
            <p className="mt-auto pt-4 text-sm font-semibold text-navy/70">
              {t(lang, "view")}{" "}
              <span aria-hidden className="inline-block transition-transform duration-200 group-hover:translate-x-1 rtl:hidden">
                →
              </span>
              <span aria-hidden className="hidden transition-transform duration-200 group-hover:-translate-x-1 rtl:inline-block">
                ←
              </span>
            </p>
          </AppLink>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-navy">{t(lang, "recentPriceChanges")}</h2>
        {moves.length === 0 ? (
          <div className="card mt-4 p-5">
            <p className="font-semibold text-navy">{t(lang, "noPriceChanges")}</p>
            <p className="mt-1 text-sm leading-relaxed text-navy/65">{t(lang, "noPriceChangesSupport")}</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "recentPriceHint")}</p>
            <ul className="mt-4 space-y-3">
              {moves.map((product) => {
                const delta = priceDelta(product);
                const up = delta > 0;
                return (
                  <li key={product.id}>
                    <AppLink href={`/prices/${product.id}`} className="card lift flex items-center justify-between gap-4 p-4 sm:p-5">
                      <span className="flex min-w-0 items-center gap-3">
                        <ProductPhoto src={product.photo} name={product.name} size="sm" />
                        <span>
                          <span className="block font-semibold text-navy">{product.name}</span>
                          {product.variant ? <span className="mt-0.5 block text-sm text-navy/55">{product.variant}</span> : null}
                        </span>
                      </span>
                      <Num className={`text-2xl font-bold ${up ? "text-clay" : "text-pine"}`}>
                        {up ? "↑" : "↓"}
                        {"\u00A0"}
                        {formatPct(delta)}
                      </Num>
                    </AppLink>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </AppShell>
  );
}

function statusCopy(lang: Parameters<typeof t>[0], count: number, changed: number, low: number) {
  if (count === 0) {
    return { title: t(lang, "statusReady"), support: t(lang, "statusReadySupport") };
  }
  if (changed > 0) {
    return {
      title: changed === 1 ? t(lang, "statusPricesOne") : t(lang, "statusPrices", { count: changed }),
      support:
        low === 0
          ? t(lang, "statusPricesSupportNone")
          : low === 1
            ? t(lang, "statusPricesSupportOne")
            : t(lang, "statusPricesSupport", { count: low }),
    };
  }
  if (low > 0) {
    return {
      title: low === 1 ? t(lang, "statusLowOne") : t(lang, "statusLow", { count: low }),
      support: t(lang, "statusLowSupport"),
    };
  }
  return { title: t(lang, "statusFine"), support: t(lang, "statusFineSupport") };
}
