"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { PriceBars } from "@/components/PriceBars";
import { ProductPhoto } from "@/components/ProductPhoto";
import { AppLink, BackLabel, Button, Field, Lead, Num } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatMoney, formatPct, formatQty } from "@/lib/format";
import { t } from "@/lib/i18n";
import { currentPrice, priceDelta } from "@/lib/metrics";
import { useStock } from "@/lib/store";
import type { Location, PricePoint } from "@/lib/types";
import {
  cartonPriceFromPiece,
  formatDeductionConfirm,
  formatPricePerCarton,
  formatPricePerPiece,
  piecePriceFromCarton,
  piecesPerCartonOf,
  toPieceQty,
} from "@/lib/units";

type QtyUnit = "piece" | "carton";
type ChartUnit = "piece" | "carton";
type PriceUnit = "piece" | "carton";

export default function PriceHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { state, recordSale, recordPurchasePrice, busy, error } = useStock();
  const lang = state.language;
  const product = state.products.find((item) => item.id === id);

  const [saleQty, setSaleQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState<QtyUnit>("piece");
  const [saleLocation, setSaleLocation] = useState<Location>("shop");
  const [newPrice, setNewPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("piece");
  const [chartUnit, setChartUnit] = useState<ChartUnit>("piece");
  const [flash, setFlash] = useState("");

  const ppc = product ? piecesPerCartonOf(product) : null;
  const canCarton = Boolean(ppc);

  const chartPoints: PricePoint[] = useMemo(() => {
    if (!product) return [];
    if (chartUnit === "carton" && ppc) {
      return product.priceHistory.map((point) => ({
        ...point,
        price: cartonPriceFromPiece(point.price, ppc),
      }));
    }
    return product.priceHistory;
  }, [product, chartUnit, ppc]);

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
  const displayPrice = chartUnit === "carton" && ppc ? cartonPriceFromPiece(price, ppc) : price;
  const lead =
    Math.abs(delta) < 0.05
      ? t(lang, "priceFlat")
      : delta > 0
        ? t(lang, "priceUp", { pct: formatPct(delta) })
        : t(lang, "priceDown", { pct: formatPct(delta) });

  const chartCaption =
    chartUnit === "carton" && ppc
      ? t(lang, "chartShowingCarton", { count: formatQty(ppc) })
      : t(lang, "chartShowingPiece");

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

        {canCarton ? (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "chartUnitLabel")}</p>
            <Menu
              label={t(lang, "chartUnitLabel")}
              value={chartUnit}
              align="start"
              options={[
                { value: "piece", label: t(lang, "chartPerPiece") },
                { value: "carton", label: t(lang, "chartPerCarton") },
              ]}
              onChange={(value) => setChartUnit(value as ChartUnit)}
            />
          </div>
        ) : null}

        <div className="card mt-6 p-5 sm:p-6">
          <p className="mb-3 text-sm font-medium text-navy/70">{chartCaption}</p>
          <PriceBars
            points={chartPoints}
            lang={lang}
            label={`${t(lang, "chartLabel")} — ${chartCaption}`}
            unitLabel={chartUnit === "carton" ? t(lang, "chartPerCarton") : t(lang, "chartPerPiece")}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="card p-5">
            <p className="text-sm text-navy/60">
              {chartUnit === "carton" && ppc ? t(lang, "chartPerCarton") : t(lang, "thisMonthPricePiece")}
            </p>
            <p className="mt-2 text-3xl font-bold text-navy">
              <Num>{formatMoney(displayPrice)}</Num>
            </p>
            <p className="mt-1 text-sm text-navy/55">
              {chartUnit === "carton" && ppc
                ? formatPricePerCarton(price, ppc, lang)
                : formatPricePerPiece(price, lang)}
            </p>
            {canCarton && chartUnit === "piece" ? (
              <p className="mt-1 text-sm text-navy/45">{formatPricePerCarton(price, ppc!, lang)}</p>
            ) : null}
            {canCarton && chartUnit === "carton" ? (
              <p className="mt-1 text-sm text-navy/45">{formatPricePerPiece(price, lang)}</p>
            ) : null}
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
            const entered = Number(saleQty);
            if (!Number.isFinite(entered) || entered <= 0) return;
            const unit: QtyUnit = canCarton ? saleUnit : "piece";
            const pieces = toPieceQty(entered, unit, ppc);
            if (pieces <= 0) return;
            try {
              await recordSale(product.id, saleLocation, pieces);
              setFlash(
                formatDeductionConfirm({
                  lang,
                  unit,
                  entered,
                  pieces,
                  location: saleLocation,
                }),
              );
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
          {canCarton ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "deductUnitLabel")}</p>
              <Menu
                label={t(lang, "deductUnitLabel")}
                value={saleUnit}
                align="start"
                options={[
                  { value: "piece", label: t(lang, "unitPieces") },
                  { value: "carton", label: t(lang, "unitCartons") },
                ]}
                onChange={(value) => setSaleUnit(value as QtyUnit)}
              />
            </div>
          ) : null}
          <Field
            id="sale-qty"
            label={canCarton && saleUnit === "carton" ? t(lang, "unitCartons") : t(lang, "saleQty")}
            hint={
              canCarton && saleUnit === "carton" && ppc
                ? t(lang, "cartonEqualsPieces", { count: formatQty(ppc) })
                : undefined
            }
          >
            <VoiceInput id="sale-qty" lang={lang} value={saleQty} onChange={setSaleQty} inputMode="decimal" />
          </Field>
          {canCarton && saleUnit === "carton" && ppc && Number(saleQty) > 0 ? (
            <p className="text-sm text-navy/60">
              {t(lang, "equalsPieces", {
                pieces: formatQty(toPieceQty(Number(saleQty), "carton", ppc)),
              })}
            </p>
          ) : null}
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
            let piecePrice = amount;
            if (canCarton && priceUnit === "carton" && ppc) {
              piecePrice = piecePriceFromCarton(amount, ppc);
            }
            if (piecePrice <= 0) return;
            try {
              const result = await recordPurchasePrice(product.id, piecePrice);
              setFlash(
                result.alert
                  ? result.alert.title
                  : canCarton && ppc
                    ? `${t(lang, "priceSaved")} — ${formatPricePerPiece(piecePrice, lang)} · ${formatPricePerCarton(piecePrice, ppc, lang)}`
                    : `${t(lang, "priceSaved")} — ${formatPricePerPiece(piecePrice, lang)}`,
              );
              setNewPrice("");
            } catch {
              /* shown via store */
            }
          }}
        >
          <p className="font-semibold text-navy">{t(lang, "updatePurchasePrice")}</p>
          {canCarton ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "updatePriceUnit")}</p>
              <Menu
                label={t(lang, "updatePriceUnit")}
                value={priceUnit}
                align="start"
                options={[
                  { value: "piece", label: t(lang, "pricePerPiece") },
                  { value: "carton", label: t(lang, "pricePerCarton") },
                ]}
                onChange={(value) => setPriceUnit(value as PriceUnit)}
              />
            </div>
          ) : null}
          <Field
            id="new-price"
            label={canCarton && priceUnit === "carton" ? t(lang, "pricePerCarton") : t(lang, "pricePerPiece")}
          >
            <VoiceInput id="new-price" lang={lang} value={newPrice} onChange={setNewPrice} inputMode="decimal" />
          </Field>
          {canCarton && priceUnit === "carton" && ppc && Number(newPrice) > 0 ? (
            <p className="text-sm text-navy/60">
              = {formatPricePerPiece(piecePriceFromCarton(Number(newPrice), ppc), lang)}
            </p>
          ) : null}
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
