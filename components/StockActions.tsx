"use client";

import { useEffect, useState } from "react";
import { Menu } from "@/components/Menu";
import { ProductPhoto } from "@/components/ProductPhoto";
import { Field } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatQty } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { totalQty } from "@/lib/metrics";
import { useStock } from "@/lib/store";
import { qtyAtLocation } from "@/lib/stock-math";
import type { Location, Product } from "@/lib/types";
import { locationLabel, piecesPerCartonOf, toPieceQty } from "@/lib/units";

type Mode = "add" | "sale" | "move" | "correct" | "edit" | "archive" | "restore";
type SaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * The three everyday stock buttons (add/sell/move, >=48px tall) for owners +
 * staff_add, plus an owner-only row (correct/edit/archive-or-restore). Opens
 * a single sheet component below in the mode that was tapped.
 */
export function StockActionButtons({
  product,
  initialMode = null,
}: {
  product: Product;
  /** Open a sheet immediately (e.g. restock from Add Product duplicate match). */
  initialMode?: Mode | null;
}) {
  const { state, role } = useStock();
  const lang = state.language;
  const [mode, setMode] = useState<Mode | null>(initialMode);
  const isOwner = role === "equal_owner" || role === "co_owner";
  const canAdd = isOwner || role === "staff_add";
  const canSell = isOwner || role === "staff_sell";
  const canMove = isOwner || role === "staff_move";

  if (!canAdd && !canSell && !canMove && !isOwner) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-label={t(lang, "stockActionsLabel")}>
        {canAdd ? <ActionButton label={t(lang, "actionAddStock")} onClick={() => setMode("add")} /> : null}
        {canSell ? <ActionButton label={t(lang, "actionRecordSale")} onClick={() => setMode("sale")} /> : null}
        {canMove ? <ActionButton label={t(lang, "actionMoveStock")} onClick={() => setMode("move")} /> : null}
      </div>
      {isOwner ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" small label={t(lang, "actionCorrectCount")} onClick={() => setMode("correct")} />
          <ActionButton variant="secondary" small label={t(lang, "actionEditProduct")} onClick={() => setMode("edit")} />
          <ActionButton
            variant="secondary"
            small
            label={product.archived ? t(lang, "actionRestore") : t(lang, "actionArchive")}
            onClick={() => setMode(product.archived ? "restore" : "archive")}
          />
        </div>
      ) : null}
      {mode ? <StockActionSheet product={product} mode={mode} onClose={() => setMode(null)} /> : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  variant = "primary",
  small = false,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`depth lift inline-flex items-center justify-center rounded-full px-4 text-sm font-semibold ${
        small ? "min-h-[40px]" : "min-h-[48px] flex-1"
      } ${variant === "primary" ? "bg-navy text-cream" : "border border-navy/20 bg-white text-navy"}`}
    >
      {label}
    </button>
  );
}

function titleAndSupportFor(lang: Lang, mode: Mode) {
  switch (mode) {
    case "add":
      return { title: t(lang, "sheetAddStockTitle"), support: t(lang, "sheetAddStockSupport") };
    case "sale":
      return { title: t(lang, "sheetRecordSaleTitle"), support: t(lang, "sheetRecordSaleSupport") };
    case "move":
      return { title: t(lang, "sheetMoveStockTitle"), support: t(lang, "sheetMoveStockSupport") };
    case "correct":
      return { title: t(lang, "sheetCorrectCountTitle"), support: t(lang, "sheetCorrectCountSupport") };
    case "edit":
      return { title: t(lang, "sheetEditProductTitle"), support: t(lang, "sheetEditProductSupport") };
    case "archive":
      return { title: t(lang, "sheetArchiveTitle"), support: t(lang, "sheetArchiveSupport") };
    case "restore":
      return { title: t(lang, "sheetRestoreTitle"), support: t(lang, "sheetRestoreSupport") };
  }
}

function StockActionSheet({ product, mode, onClose }: { product: Product; mode: Mode; onClose: () => void }) {
  const { state, addStock, recordSale, moveStock, correctCount, editProduct, archiveProduct, restoreProduct } =
    useStock();
  const lang = state.language;
  const places = state.places?.length ? state.places : [];
  const placeIds = places.map((p) => p.id);
  const defaultPlace = placeIds[0] || "warehouse";
  const ppc = piecesPerCartonOf(product);
  const canCarton = Boolean(ppc);

  // One idempotency key per sheet-open; reused verbatim on Retry so a failed
  // attempt and its retry are the SAME request as far as the server is concerned.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<"piece" | "carton">("piece");
  const [location, setLocation] = useState<Location>(defaultPlace);
  const [fromLocation, setFromLocation] = useState<Location>(defaultPlace);
  const [toLocation, setToLocation] = useState<Location>(placeIds.includes("shop") ? "shop" : placeIds[1] || "shop");
  const [newCount, setNewCount] = useState(String(qtyAtLocation(product, location)));

  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [variant, setVariant] = useState(product.variant);
  const [threshold, setThreshold] = useState(String(product.restockThreshold));
  const [ppcInput, setPpcInput] = useState(product.piecesPerCarton ? String(product.piecesPerCarton) : "");

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calmNote, setCalmNote] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [savedTotal, setSavedTotal] = useState<number | null>(null);

  useEffect(() => {
    if (mode === "correct") setNewCount(String(qtyAtLocation(product, location)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, mode]);

  const { title, support } = titleAndSupportFor(lang, mode);

  async function submit() {
    if ((mode === "archive" || mode === "restore") && !confirmStep) {
      setConfirmStep(true);
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
    try {
      if (mode === "add" || mode === "sale") {
        const pieces = toPieceQty(Number(amount), unit, ppc);
        if (pieces <= 0) throw new Error(t(lang, "qtyInvalid"));
        if (mode === "add") {
          const { product: next } = await addStock({
            productId: product.id,
            location,
            quantity: pieces,
            idempotencyKey,
          });
          setSavedTotal(totalQty(next));
        } else {
          const result = await recordSale(product.id, location, pieces, idempotencyKey);
          setSavedTotal(totalQty(result.product));
          setCalmNote(result.note);
        }
      } else if (mode === "move") {
        if (fromLocation === toLocation) throw new Error(t(lang, "sameLocationError"));
        const pieces = toPieceQty(Number(amount), unit, ppc);
        if (pieces <= 0) throw new Error(t(lang, "qtyInvalid"));
        const result = await moveStock({
          productId: product.id,
          from: fromLocation,
          to: toLocation,
          quantity: pieces,
          idempotencyKey,
        });
        setSavedTotal(totalQty(result.product));
        setCalmNote(result.note);
      } else if (mode === "correct") {
        const count = Number(newCount);
        if (!Number.isFinite(count) || count < 0) throw new Error(t(lang, "qtyInvalid"));
        const { product: next } = await correctCount({ productId: product.id, location, newCount: count, idempotencyKey });
        setSavedTotal(totalQty(next));
      } else if (mode === "edit") {
        await editProduct({
          productId: product.id,
          name,
          category,
          variant,
          restockThreshold: threshold.trim() === "" ? undefined : Number(threshold),
          piecesPerCarton: ppcInput.trim() === "" ? null : Number(ppcInput),
        });
      } else if (mode === "archive") {
        await archiveProduct(product.id);
      } else if (mode === "restore") {
        await restoreProduct(product.id);
      }
      setStatus("saved");
      window.setTimeout(onClose, 1400);
    } catch (err) {
      setStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : t(lang, "failedTryAgain"));
    }
  }

  const locationOptions = places.length
    ? places.map((place) => ({ value: place.id, label: place.name }))
    : (["warehouse", "shop", "online"] as const).map((id) => ({
        value: id,
        label: locationLabel(lang, id),
      }));
  const saving = status === "saving";

  let saveLabel = t(lang, "save");
  if (saving) saveLabel = t(lang, "savingEllipsis");
  else if (status === "saved") {
    saveLabel = savedTotal != null ? t(lang, "savedWithTotal", { total: formatQty(savedTotal) }) : t(lang, "savedCheck");
  } else if (status === "failed") saveLabel = t(lang, "retry");
  else if (mode === "archive" || mode === "restore") {
    saveLabel = confirmStep
      ? t(lang, "confirmAgain")
      : mode === "archive"
        ? t(lang, "actionArchive")
        : t(lang, "actionRestore");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="depth w-full max-w-md overflow-y-auto rounded-card bg-cream p-5 sm:max-h-[85vh] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ProductPhoto src={product.photo} name={product.name} size="sm" />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-snug text-navy">{title}</p>
              <p className="truncate text-sm text-navy/60">{product.name}</p>
            </div>
          </div>
          <button type="button" className="shrink-0 text-sm font-semibold text-navy/60" onClick={onClose}>
            {t(lang, "closeSheet")}
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-navy/65">{support}</p>
        {calmNote && status === "saved" ? (
          <p className="mt-3 text-sm leading-relaxed text-navy/75" role="status">
            {calmNote}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          {(mode === "add" || mode === "sale") && (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "location")}</p>
                <Menu
                  label={t(lang, "location")}
                  value={location}
                  align="start"
                  options={locationOptions}
                  onChange={(v) => setLocation(v as Location)}
                />
              </div>
              {canCarton ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "deductUnitLabel")}</p>
                  <Menu
                    label={t(lang, "deductUnitLabel")}
                    value={unit}
                    align="start"
                    options={[
                      { value: "piece", label: t(lang, "unitPieces") },
                      { value: "carton", label: t(lang, "unitCartons") },
                    ]}
                    onChange={(v) => setUnit(v as "piece" | "carton")}
                  />
                </div>
              ) : null}
              <Field id="sheet-amount" label={unit === "carton" ? t(lang, "unitCartons") : t(lang, "amountLabel")}>
                <VoiceInput id="sheet-amount" lang={lang} inputMode="decimal" value={amount} onChange={setAmount} />
              </Field>
            </>
          )}

          {mode === "move" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "fromLocation")}</p>
                  <Menu
                    label={t(lang, "fromLocation")}
                    value={fromLocation}
                    align="start"
                    options={locationOptions}
                    onChange={(v) => setFromLocation(v as Location)}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "toLocation")}</p>
                  <Menu
                    label={t(lang, "toLocation")}
                    value={toLocation}
                    align="start"
                    options={locationOptions}
                    onChange={(v) => setToLocation(v as Location)}
                  />
                </div>
              </div>
              {canCarton ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "deductUnitLabel")}</p>
                  <Menu
                    label={t(lang, "deductUnitLabel")}
                    value={unit}
                    align="start"
                    options={[
                      { value: "piece", label: t(lang, "unitPieces") },
                      { value: "carton", label: t(lang, "unitCartons") },
                    ]}
                    onChange={(v) => setUnit(v as "piece" | "carton")}
                  />
                </div>
              ) : null}
              <Field id="sheet-move-amount" label={unit === "carton" ? t(lang, "unitCartons") : t(lang, "amountLabel")}>
                <VoiceInput id="sheet-move-amount" lang={lang} inputMode="decimal" value={amount} onChange={setAmount} />
              </Field>
            </>
          )}

          {mode === "correct" && (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "location")}</p>
                <Menu
                  label={t(lang, "location")}
                  value={location}
                  align="start"
                  options={locationOptions}
                  onChange={(v) => setLocation(v as Location)}
                />
              </div>
              <Field id="sheet-new-count" label={t(lang, "newCountLabel")} hint={t(lang, "newCountHint")}>
                <VoiceInput id="sheet-new-count" lang={lang} inputMode="numeric" value={newCount} onChange={setNewCount} />
              </Field>
            </>
          )}

          {mode === "edit" && (
            <>
              <Field id="sheet-name" label={t(lang, "productName")}>
                <VoiceInput id="sheet-name" lang={lang} value={name} onChange={setName} />
              </Field>
              <Field id="sheet-category" label={t(lang, "category")}>
                <VoiceInput id="sheet-category" lang={lang} value={category} onChange={setCategory} />
              </Field>
              <Field id="sheet-variant" label={t(lang, "variant")}>
                <VoiceInput id="sheet-variant" lang={lang} value={variant} onChange={setVariant} />
              </Field>
              <Field id="sheet-threshold" label={t(lang, "lowStockThreshold")} hint={t(lang, "lowStockThresholdHint")}>
                <VoiceInput id="sheet-threshold" lang={lang} inputMode="numeric" value={threshold} onChange={setThreshold} />
              </Field>
              <Field id="sheet-ppc" label={t(lang, "piecesPerCarton")} hint={t(lang, "piecesPerCartonHint")}>
                <VoiceInput id="sheet-ppc" lang={lang} inputMode="numeric" value={ppcInput} onChange={setPpcInput} placeholder="100" />
              </Field>
            </>
          )}

          {(mode === "archive" || mode === "restore") && confirmStep ? (
            <p className="text-sm font-semibold text-clay">{t(lang, "confirmAgain")}</p>
          ) : null}
        </div>

        {errorMsg ? <p className="mt-3 text-sm font-medium text-clay" role="alert">{errorMsg}</p> : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className={`depth lift flex-1 rounded-full px-6 py-3 text-sm font-semibold ${
              status === "failed" ? "bg-clay text-cream" : "bg-navy text-cream"
            } ${saving ? "pointer-events-none opacity-60" : ""}`}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
