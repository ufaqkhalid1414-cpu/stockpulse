"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EntryPriceBars, type EntryBarPoint } from "@/components/EntryPriceBars";
import { Menu } from "@/components/Menu";
import { ProductPhoto } from "@/components/ProductPhoto";
import { AppLink, BackLabel, Button, Field, Lead, Num } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatDateTime, formatMoney, formatPct, formatQty } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  entryPctChange,
  formatEntryChartLabel,
  formatPriceWithUnit,
  lastNEntries,
  ppcForEntry,
  priceInUnit,
} from "@/lib/price-display";
import { currentPrice, priceDelta } from "@/lib/metrics";
import { useStock } from "@/lib/store";
import type { Location, PriceCompareUnit, PriceEntry } from "@/lib/types";
import {
  formatDeductionConfirm,
  formatPricePerCarton,
  formatPricePerPiece,
  piecePriceFromCarton,
  piecesPerCartonOf,
  toPieceQty,
} from "@/lib/units";

type QtyUnit = "piece" | "carton";
type PriceUnit = "piece" | "carton";

function entryDisplayPrice(entry: PriceEntry, unit: PriceCompareUnit, productPpc: number | null): number {
  const ppc = ppcForEntry(entry, productPpc);
  const comparePpc = unit === "carton" ? ppc : null;
  return priceInUnit(entry.pricePerPiece, unit, comparePpc);
}

export default function PriceHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { state, role, recordSale, recordPurchasePrice, setPriceCompareUnit, busy, error } = useStock();
  const lang = state.language;
  const product = state.products.find((item) => item.id === id);
  const isOwner = role === "equal_owner" || role === "co_owner";

  const [saleQty, setSaleQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState<QtyUnit>("piece");
  const [saleError, setSaleError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [saleLocation, setSaleLocation] = useState<Location>("shop");
  const [newPrice, setNewPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("piece");
  const [flash, setFlash] = useState("");

  const ppc = product ? piecesPerCartonOf(product) : null;
  const canCarton = Boolean(ppc);

  const compareUnit: PriceCompareUnit = product?.priceCompareUnit ?? (canCarton ? "carton" : "piece");
  const effectiveCompareUnit: PriceCompareUnit =
    compareUnit === "carton" && !canCarton ? "piece" : compareUnit;

  const entries = product?.priceEntries?.length
    ? product.priceEntries
    : (product?.priceHistory ?? []).map((point, index) => ({
        id: String(index),
        recordedAt: "",
        pricePerPiece: point.price,
        piecesPerCarton: product?.piecesPerCarton ?? null,
      }));

  const chartBarPoints: EntryBarPoint[] = useMemo(() => {
    if (!product) return [];
    const slice = lastNEntries(entries, 6);
    return slice.map((entry) => {
      const price = entryDisplayPrice(entry, effectiveCompareUnit, ppc);
      const dateLabel = entry.recordedAt ? formatEntryChartLabel(entry.recordedAt, lang) : "—";
      const unitPhrase =
        effectiveCompareUnit === "carton" && ppc
          ? t(lang, "chartPerCarton")
          : t(lang, "chartPerPiece");
      return {
        id: entry.id,
        label: dateLabel,
        price,
        tip: `${entry.recordedAt ? formatDateTime(entry.recordedAt, lang) : dateLabel} · ${formatMoney(price)} ${unitPhrase}`,
      };
    });
  }, [product, entries, effectiveCompareUnit, ppc, lang]);

  const entriesNewestFirst = useMemo(() => [...entries].reverse(), [entries]);

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
  const displayPrice = entryDisplayPrice(
    entries[entries.length - 1] ?? {
      id: "current",
      recordedAt: "",
      pricePerPiece: price,
      piecesPerCarton: ppc,
    },
    effectiveCompareUnit,
    ppc,
  );
  const lead =
    entries.length < 2
      ? t(lang, "priceEntryFirst")
      : Math.abs(delta) < 0.05
        ? t(lang, "priceFlatFromLastEntry")
        : delta > 0
          ? t(lang, "priceUpFromLastEntry", { pct: formatPct(delta) })
          : t(lang, "priceDownFromLastEntry", { pct: formatPct(delta) });

  const chartCaption =
    effectiveCompareUnit === "carton" && ppc
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
            <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "comparePricesPer")}</p>
            <Menu
              label={t(lang, "comparePricesPer")}
              value={effectiveCompareUnit}
              align="start"
              options={[
                { value: "piece", label: t(lang, "chartPerPiece") },
                { value: "carton", label: t(lang, "chartPerCarton") },
              ]}
              onChange={async (value) => {
                const unit = value as PriceCompareUnit;
                if (unit === effectiveCompareUnit || !isOwner) return;
                try {
                  await setPriceCompareUnit(product.id, unit);
                } catch {
                  /* store error */
                }
              }}
            />
          </div>
        ) : null}

        <div className="card mt-6 p-5 sm:p-6">
          <p className="mb-1 text-sm font-medium text-navy/70">
            {t(lang, "chartLastEntries", { count: Math.min(6, entries.length) })}
          </p>
          <p className="mb-3 text-sm text-navy/55">{chartCaption}</p>
          <EntryPriceBars
            points={chartBarPoints}
            label={`${t(lang, "chartLabel")} — ${chartCaption}`}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="card p-5">
            <p className="text-sm text-navy/60">{t(lang, "latestEntryPrice")}</p>
            <p className="mt-2 text-3xl font-bold text-navy">
              <Num>{formatMoney(displayPrice)}</Num>
            </p>
            <p className="mt-1 text-sm text-navy/55">
              {formatPriceWithUnit(
                price,
                effectiveCompareUnit,
                effectiveCompareUnit === "carton" ? ppc : null,
                lang,
              )}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-navy/60">{t(lang, "changeVsLastEntry")}</p>
            <p className={`mt-2 text-3xl font-bold ${delta > 0.05 ? "text-clay" : delta < -0.05 ? "text-pine" : "text-navy"}`}>
              {entries.length < 2 ? (
                "—"
              ) : (
                <>
                  {delta > 0.05 ? "↑ " : delta < -0.05 ? "↓ " : ""}
                  <Num>{formatPct(delta)}</Num>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="card mt-6 p-5 sm:p-6">
          <p className="font-semibold text-navy">{t(lang, "priceEntryListTitle")}</p>
          <ul className="mt-4 divide-y divide-navy/10">
            {entriesNewestFirst.map((entry, index) => {
              const older = entriesNewestFirst[index + 1];
              const inUnit = entryDisplayPrice(entry, effectiveCompareUnit, ppc);
              const dateText = entry.recordedAt ? formatDateTime(entry.recordedAt, lang) : "—";
              let changeLine = t(lang, "priceEntryFirst");
              if (older) {
                const pct = entryPctChange(older, entry);
                if (Math.abs(pct) < 0.05) {
                  changeLine = t(lang, "priceEntryVsPreviousFlat");
                } else if (pct > 0) {
                  changeLine = t(lang, "priceEntryVsPreviousUp", { pct: formatPct(pct) });
                } else {
                  changeLine = t(lang, "priceEntryVsPreviousDown", { pct: formatPct(pct) });
                }
              }
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-navy">{dateText}</p>
                    <p className="text-sm text-navy/55">{changeLine}</p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums text-navy">
                    <Num>{formatMoney(inUnit)}</Num>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        <form
          className="card mt-6 space-y-4 p-5 sm:p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaleError("");
            setFlash("");
            const entered = Number(saleQty);
            if (!Number.isFinite(entered) || entered <= 0) {
              setSaleError(t(lang, "qtyInvalid"));
              return;
            }
            const unit: QtyUnit = canCarton ? saleUnit : "piece";
            const pieces = toPieceQty(entered, unit, ppc);
            if (pieces <= 0) {
              setSaleError(t(lang, "qtyInvalid"));
              return;
            }
            try {
              await recordSale(product.id, saleLocation, pieces, crypto.randomUUID());
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
              setFlash("");
              /* store surfaces the error */
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
            error={saleError || undefined}
          >
            <VoiceInput
              id="sale-qty"
              lang={lang}
              value={saleQty}
              onChange={(next) => {
                setSaleQty(next);
                if (saleError) setSaleError("");
              }}
              inputMode="decimal"
            />
          </Field>
          {canCarton && saleUnit === "carton" && ppc && Number(saleQty) > 0 ? (
            <p className="text-sm text-navy/60">
              {t(lang, "equalsPieces", {
                pieces: formatQty(toPieceQty(Number(saleQty), "carton", ppc)),
              })}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? t(lang, "savingEllipsis") : t(lang, "save")}
          </Button>
        </form>

        <form
          className="card mt-4 space-y-4 p-5 sm:p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setPriceError("");
            setFlash("");
            const amount = Number(newPrice);
            if (!Number.isFinite(amount) || amount <= 0) {
              setPriceError(t(lang, "priceInvalid"));
              return;
            }
            let piecePrice = amount;
            if (canCarton && priceUnit === "carton" && ppc) {
              piecePrice = piecePriceFromCarton(amount, ppc);
            }
            if (piecePrice <= 0) {
              setPriceError(t(lang, "priceInvalid"));
              return;
            }
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
              setFlash("");
              /* store surfaces the error */
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
            error={priceError || undefined}
          >
            <VoiceInput
              id="new-price"
              lang={lang}
              value={newPrice}
              onChange={(next) => {
                setNewPrice(next);
                if (priceError) setPriceError("");
              }}
              inputMode="decimal"
            />
          </Field>
          {canCarton && priceUnit === "carton" && ppc && Number(newPrice) > 0 ? (
            <p className="text-sm text-navy/60">
              = {formatPricePerPiece(piecePriceFromCarton(Number(newPrice), ppc), lang)}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? t(lang, "savingEllipsis") : t(lang, "save")}
          </Button>
        </form>

        {flash ? (
          <p className="mt-4 text-sm font-medium text-pine" role="status">
            {flash}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm font-medium text-clay" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
