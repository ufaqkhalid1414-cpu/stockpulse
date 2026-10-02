"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { PriceBars } from "@/components/PriceBars";
import { ProductPhoto } from "@/components/ProductPhoto";
import { AppLink, BackLabel, Button, Field, Lead, Num } from "@/components/ui";
import { formatMoney, formatPct } from "@/lib/format";
import { t } from "@/lib/i18n";
import { currentPrice, priceDelta } from "@/lib/metrics";
import { useStock } from "@/lib/store";
import type { Location } from "@/lib/types";

export default function PriceHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { state, recordSale, recordPurchasePrice, busy, error } = useStock();
  const lang = state.language;
  const product = state.products.find((item) => item.id === id);

  const [saleQty, setSaleQty] = useState("1");
  const [saleLocation, setSaleLocation] = useState<Location>("shop");
  const [newPrice, setNewPrice] = useState("");
  const [flash, setFlash] = useState("");

  if (!product) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Lead title={t(lang, "productMissing")} />
        <AppLink href="/dashboard" className="mt-6 inline-block font-semibold text-navy">
          {t(lang, "goDashboard")}
        </AppLink>
      </div>
    );
  }

  const delta = priceDelta(product);
  const price = currentPrice(product);
  const lead =
    Math.abs(delta) < 0.05
      ? t(lang, "priceFlat")
      : delta > 0
        ? t(lang, "priceUp", { pct: formatPct(delta) })
        : t(lang, "priceDown", { pct: formatPct(delta) });

  return (
    <AppShell>
      <div className="max-w-3xl">
        <BackLabel label={t(lang, "back")} fallback="/dashboard" />
        <div className="mt-6">
          <div className="flex items-center gap-3">
            <ProductPhoto src={product.photo} name={product.name} />
            <p className="text-sm font-medium text-navy/55">{product.name}</p>
          </div>
          <Lead title={lead} />
        </div>
        <div className="card mt-6 p-5 sm:p-6">
          <PriceBars points={product.priceHistory} lang={lang} label={t(lang, "chartLabel")} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="card p-5">
            <p className="text-sm text-navy/60">{t(lang, "thisMonthPrice")}</p>
            <p className="mt-2 text-3xl font-bold text-navy">
              <Num>{formatMoney(price)}</Num>
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-navy/60">{t(lang, "changeVsLast")}</p>
            <p className={`mt-2 text-3xl font-bold ${delta > 0.05 ? "text-clay" : delta < -0.05 ? "text-pine" : "text-navy"}`}>
              {delta > 0.05 ? "↑ " : delta < -0.05 ? "↓ " : ""}
              <Num>{formatPct(delta)}</Num>
            </p>
          </div>
        </div>

        <form
          className="card mt-6 space-y-4 p-5 sm:p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const qty = Number(saleQty);
            if (!Number.isFinite(qty) || qty <= 0) return;
            try {
              await recordSale(product.id, saleLocation, qty);
              setFlash(t(lang, "saleSaved"));
              setSaleQty("1");
            } catch {
              /* shown via store */
            }
          }}
        >
          <p className="font-semibold text-navy">{t(lang, "recordSale")}</p>
          <div>
            <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "location")}</p>
            <Menu
              label={t(lang, "location")}
              value={saleLocation}
              align="start"
              options={[
                { value: "warehouse", label: t(lang, "warehouse") },
                { value: "shop", label: t(lang, "shop") },
                { value: "online", label: t(lang, "online") },
              ]}
              onChange={(value) => setSaleLocation(value as Location)}
            />
          </div>
          <Field id="sale-qty" label={t(lang, "saleQty")}>
            <input id="sale-qty" className="field" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} inputMode="decimal" />
          </Field>
          <Button type="submit" disabled={busy}>
            {t(lang, "save")}
          </Button>
        </form>

        <form
          className="card mt-4 space-y-4 p-5 sm:p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const amount = Number(newPrice);
            if (!Number.isFinite(amount) || amount <= 0) return;
            try {
              const result = await recordPurchasePrice(product.id, amount);
              setFlash(result.alert ? result.alert.title : t(lang, "priceSaved"));
              setNewPrice("");
            } catch {
              /* shown via store */
            }
          }}
        >
          <p className="font-semibold text-navy">{t(lang, "updatePurchasePrice")}</p>
          <Field id="new-price" label={t(lang, "purchasePrice")}>
            <input id="new-price" className="field" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Button type="submit" disabled={busy}>
            {t(lang, "save")}
          </Button>
        </form>

        {flash ? <p className="mt-4 text-sm font-medium text-pine">{flash}</p> : null}
        {error ? <p className="mt-2 text-sm font-medium text-clay">{error}</p> : null}
      </div>
    </AppShell>
  );
}
