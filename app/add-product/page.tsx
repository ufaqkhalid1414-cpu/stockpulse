"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { StockActionButtons } from "@/components/StockActions";
import { Button, Field, Lead, BackLabel } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { defaultNewStockLocation, DEFAULT_NEW_PRICE_UNIT } from "@/lib/add-product-defaults";
import { t } from "@/lib/i18n";
import { readPhoto } from "@/lib/photo";
import { findExactProduct, findNameMatches, findSimilarProducts } from "@/lib/product-search";
import { markScrollTop } from "@/lib/scroll";
import { useStock } from "@/lib/store";
import type { Location, Product } from "@/lib/types";
import { formatPricePerCarton, formatPricePerPiece, piecePriceFromCarton } from "@/lib/units";

type PriceUnit = "piece" | "carton";

export default function AddProductPage() {
  const { state, addProduct, role, homePath, busy } = useStock();
  const lang = state.language;
  const places = state.places?.length ? state.places : [];
  const router = useRouter();
  const isStaff =
    role === "staff_add" || role === "staff_view" || role === "staff_sell" || role === "staff_move";
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState<Location>(() => defaultNewStockLocation(places));
  const [locationTouched, setLocationTouched] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(DEFAULT_NEW_PRICE_UNIT);
  const [price, setPrice] = useState("");
  const [piecesPerCarton, setPiecesPerCarton] = useState("");
  const [threshold, setThreshold] = useState("");
  const [variant, setVariant] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [dupExact, setDupExact] = useState<Product | null>(null);
  const [createAnywayArmed, setCreateAnywayArmed] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const namePrefillDone = useRef(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (namePrefillDone.current || typeof window === "undefined") return;
    const prefill = new URLSearchParams(window.location.search).get("name");
    if (prefill) {
      setName(prefill);
      namePrefillDone.current = true;
    }
  }, []);

  // Prefer Shop once places load; never overwrite after the user picks another place.
  useEffect(() => {
    if (locationTouched) return;
    setLocation(defaultNewStockLocation(places));
  }, [places, locationTouched]);

  const nameMatches = useMemo(
    () => findNameMatches(state.products, name, 5),
    [state.products, name],
  );
  const similar = useMemo(() => {
    if (nameMatches.length > 0) return [];
    return findSimilarProducts(state.products, name, 3);
  }, [state.products, name, nameMatches.length]);

  const preview = useMemo(() => {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (priceUnit === "piece") {
      return { piecePrice: amount, piecesPerCarton: null as number | null };
    }
    const ppc = Number(piecesPerCarton);
    if (!Number.isFinite(ppc) || ppc < 2) return null;
    const ratio = Math.floor(ppc);
    return {
      piecePrice: piecePriceFromCarton(amount, ratio),
      piecesPerCarton: ratio,
    };
  }, [price, priceUnit, piecesPerCarton]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t(lang, "fieldRequired");
    if (!category.trim()) next.category = t(lang, "fieldRequired");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || quantity.trim() === "") next.quantity = t(lang, "qtyInvalid");

    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) next.price = t(lang, "priceInvalid");

    let purchasePrice = amount;
    let savedPpc: number | null = null;

    if (priceUnit === "carton") {
      const ppc = Number(piecesPerCarton);
      if (!Number.isFinite(ppc) || ppc < 2) next.piecesPerCarton = t(lang, "piecesPerCartonInvalid");
      else {
        savedPpc = Math.floor(ppc);
        purchasePrice = piecePriceFromCarton(amount, savedPpc);
        if (purchasePrice <= 0) next.price = t(lang, "priceInvalid");
      }
    }

    let restockThreshold: number | undefined;
    if (threshold.trim() !== "") {
      const th = Number(threshold);
      if (!Number.isFinite(th) || th < 0) next.threshold = t(lang, "thresholdInvalid");
      else restockThreshold = Math.floor(th);
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || busy || showSuccess) return;

    const exact = findExactProduct(state.products, name, variant);
    if (exact && !createAnywayArmed) {
      setDupExact(exact);
      setCreateAnywayArmed(false);
      return;
    }

    void addProduct({
      name,
      category,
      variant,
      location,
      quantity: qty,
      purchasePrice,
      photo,
      restockThreshold,
      piecesPerCarton: savedPpc,
    })
      .then(() => {
        setDupExact(null);
        setCreateAnywayArmed(false);
        setShowSuccess(true);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => finishAfterSuccess(), 1100);
      })
      .catch(() => {
        /* store surfaces the error; do not show success */
      });
  }

  function finishAfterSuccess() {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setShowSuccess(false);
    markScrollTop();
    if (isStaff) {
      setName("");
      setCategory("");
      setVariant("");
      setQuantity("1");
      setPrice("");
      setPiecesPerCarton("");
      setThreshold("");
      setPhoto(undefined);
      setShowPhoto(false);
      setPriceUnit(DEFAULT_NEW_PRICE_UNIT);
      setLocationTouched(false);
      setLocation(defaultNewStockLocation(places));
    } else {
      router.push("/dashboard", { scroll: false });
    }
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPhoto(await readPhoto(file));
    } catch {
      setPhoto(undefined);
    }
  }

  const successPopup =
    portalReady && showSuccess
      ? createPortal(
          <button
            type="button"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/35 px-5 backdrop-blur-[2px]"
            role="alertdialog"
            aria-modal="true"
            aria-live="assertive"
            aria-label={t(lang, "productAddedSuccess")}
            onClick={finishAfterSuccess}
          >
            <div className="depth w-full max-w-sm rounded-card bg-cream px-6 py-8 text-center shadow-[var(--shadow-lift)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage text-pine">
                <ThumbsUpIcon />
              </div>
              <p className="mt-4 text-xl font-bold text-navy">{t(lang, "productAddedSuccess")}</p>
            </div>
          </button>,
          document.body,
        )
      : null;

  const dupPopup =
    portalReady && dupExact
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/35 px-5"
            role="alertdialog"
            aria-modal="true"
          >
            <div className="depth w-full max-w-md rounded-card bg-cream p-6 shadow-[var(--shadow-lift)]">
              <p className="text-lg font-bold text-navy">
                {t(lang, "dupExactTitle", {
                  name: `${dupExact.name}${dupExact.variant ? ` (${dupExact.variant})` : ""}`,
                })}
              </p>
              <p className="mt-2 text-sm text-navy/70">{t(lang, "dupExactSupport")}</p>
              <div className="mt-5 flex flex-col gap-2">
                <Button
                  type="button"
                  full
                  onClick={() => {
                    setRestockProduct(dupExact);
                    setDupExact(null);
                  }}
                >
                  {t(lang, "dupAddStock")}
                </Button>
                {!createAnywayArmed ? (
                  <Button
                    type="button"
                    variant="secondary"
                    full
                    onClick={() => setCreateAnywayArmed(true)}
                  >
                    {t(lang, "dupCreateAnyway")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    full
                    onClick={() => {
                      setDupExact(null);
                      // Re-submit with create-anyway armed
                      window.setTimeout(() => {
                        const form = document.getElementById("add-product-form") as HTMLFormElement | null;
                        form?.requestSubmit();
                      }, 0);
                    }}
                  >
                    {t(lang, "dupCreateConfirm")}
                  </Button>
                )}
                <button
                  type="button"
                  className="mt-1 text-sm font-semibold text-navy/60"
                  onClick={() => {
                    setDupExact(null);
                    setCreateAnywayArmed(false);
                  }}
                >
                  {t(lang, "closeSheet")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <AppShell>
      {successPopup}
      {dupPopup}
      {restockProduct ? (
        <div className="mb-4">
          <StockActionButtons product={restockProduct} initialMode="add" />
        </div>
      ) : null}
      <div className="max-w-lg">
        {!isStaff ? <BackLabel label={t(lang, "back")} fallback={homePath || "/dashboard"} /> : null}
        <div className={isStaff ? "" : "mt-6"}>
          <Lead title={t(lang, "addTitle")} support={t(lang, "addSupport")} />
        </div>
        <form id="add-product-form" className="card mt-6 space-y-5 p-5 sm:p-6" onSubmit={submit}>
          <Field id="name" label={t(lang, "productName")} error={errors.name}>
            <VoiceInput
              id="name"
              lang={lang}
              value={name}
              onChange={(value) => {
                setName(value);
                setCreateAnywayArmed(false);
              }}
              placeholder={t(lang, "productNamePlaceholder")}
            />
          </Field>
          {nameMatches.length > 0 ? (
            <div className="rounded-[12px] border border-navy/10 bg-cream/70 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy/55">
                {t(lang, "dupMatchingProducts")}
              </p>
              <ul className="mt-2 space-y-2">
                {nameMatches.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="lift w-full rounded-[10px] bg-white px-3 py-2.5 text-start text-sm font-semibold text-navy"
                      onClick={() => setRestockProduct(product)}
                    >
                      {product.name}
                      {product.variant ? ` · ${product.variant}` : ""}
                      <span className="mt-0.5 block text-xs font-medium text-navy/55">
                        {t(lang, "dupAddStock")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {similar.length > 0 ? (
            <div className="rounded-[12px] border border-navy/10 bg-white px-3 py-3">
              <p className="text-xs font-semibold text-navy/55">{t(lang, "dupDidYouMean")}</p>
              <ul className="mt-2 space-y-1">
                {similar.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="text-sm font-semibold text-navy underline-offset-2 hover:underline"
                      onClick={() => setRestockProduct(product)}
                    >
                      {product.name}
                      {product.variant ? ` (${product.variant})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="pt-3">
            <Field id="category" label={t(lang, "category")} error={errors.category}>
              <VoiceInput id="category" lang={lang} value={category} onChange={setCategory} placeholder={t(lang, "categoryPlaceholder")} />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-navy/80" id="location-label">
              {t(lang, "location")}
            </p>
            <Menu
              label={t(lang, "location")}
              value={location}
              align="start"
              options={
                places.length
                  ? places.map((p) => ({ value: p.id, label: p.name }))
                  : [
                      { value: "warehouse", label: t(lang, "warehouse") },
                      { value: "shop", label: t(lang, "shop") },
                      { value: "online", label: t(lang, "online") },
                    ]
              }
              onChange={(value) => {
                setLocationTouched(true);
                setLocation(value as Location);
              }}
            />
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-navy/60" aria-describedby="location-label">
              <li>
                <span className="font-semibold text-navy/75">{t(lang, "warehouse")}:</span>{" "}
                {t(lang, "locationWarehouseHint")}
              </li>
              <li>
                <span className="font-semibold text-navy/75">{t(lang, "shop")}:</span>{" "}
                {t(lang, "locationShopHint")}
              </li>
              <li>
                <span className="font-semibold text-navy/75">{t(lang, "online")}:</span>{" "}
                {t(lang, "locationOnlineHint")}
              </li>
            </ul>
          </div>
          <Field id="quantity" label={t(lang, "quantity")} error={errors.quantity}>
            <VoiceInput id="quantity" lang={lang} inputMode="decimal" value={quantity} onChange={setQuantity} />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "priceUnitLabel")}</p>
            <Menu
              label={t(lang, "priceUnitLabel")}
              value={priceUnit}
              align="start"
              options={[
                { value: "piece", label: t(lang, "pricePerPiece") },
                { value: "carton", label: t(lang, "pricePerCarton") },
              ]}
              onChange={(value) => {
                setPriceUnit(value as PriceUnit);
                setErrors((prev) => {
                  const { piecesPerCarton: _drop, ...rest } = prev;
                  return rest;
                });
              }}
            />
          </div>

          <Field
            id="price"
            label={priceUnit === "carton" ? t(lang, "pricePerCarton") : t(lang, "pricePerPiece")}
            error={errors.price}
          >
            <VoiceInput id="price" lang={lang} inputMode="decimal" value={price} onChange={setPrice} placeholder="0" />
          </Field>

          {priceUnit === "carton" ? (
            <Field
              id="pieces-per-carton"
              label={t(lang, "piecesPerCarton")}
              hint={t(lang, "piecesPerCartonHint")}
              error={errors.piecesPerCarton}
            >
              <VoiceInput
                id="pieces-per-carton"
                lang={lang}
                inputMode="numeric"
                value={piecesPerCarton}
                onChange={setPiecesPerCarton}
                placeholder="100"
              />
            </Field>
          ) : null}

          {preview && preview.piecePrice > 0 ? (
            <div className="rounded-[12px] border border-navy/10 bg-cream/60 px-4 py-3 text-sm text-navy">
              <p className="font-medium text-navy/70">{t(lang, "priceBothPreview")}</p>
              <p className="mt-1 font-semibold">{formatPricePerPiece(preview.piecePrice, lang)}</p>
              {preview.piecesPerCarton ? (
                <p className="mt-0.5 font-semibold">
                  {formatPricePerCarton(preview.piecePrice, preview.piecesPerCarton, lang)}
                </p>
              ) : null}
            </div>
          ) : null}

          <Field
            id="threshold"
            label={t(lang, "lowStockThreshold")}
            hint={t(lang, "lowStockThresholdHint")}
            error={errors.threshold}
          >
            <VoiceInput
              id="threshold"
              lang={lang}
              inputMode="numeric"
              value={threshold}
              onChange={setThreshold}
              placeholder={t(lang, "lowStockThresholdPlaceholder")}
            />
          </Field>
          <Field id="variant" label={t(lang, "variant")} hint={t(lang, "variantHint")}>
            <VoiceInput id="variant" lang={lang} value={variant} onChange={setVariant} placeholder={t(lang, "variantPlaceholder")} />
          </Field>

          {!showPhoto ? (
            <button
              type="button"
              className="lift text-start text-sm font-semibold text-navy"
              onClick={() => setShowPhoto(true)}
            >
              {t(lang, "addPhoto")}
            </button>
          ) : (
            <div>
              <input
                ref={fileRef}
                id="photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhoto}
              />
              {photo ? (
                <div className="flex items-center gap-4">
                  <img
                    src={photo}
                    alt={name.trim() || t(lang, "choosePhoto")}
                    className="h-16 w-16 rounded-[12px] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{name.trim() || t(lang, "productName")}</p>
                    <button
                      type="button"
                      className="lift mt-1 text-sm font-semibold text-navy/70"
                      onClick={() => setPhoto(undefined)}
                    >
                      {t(lang, "removePhoto")}
                    </button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  {t(lang, "choosePhoto")}
                </Button>
              )}
            </div>
          )}

          <Button type="submit" full disabled={busy || showSuccess}>
            {busy ? t(lang, "savingEllipsis") : t(lang, "save")}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-pine">
      <path
        d="M7 11v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2Zm0 0V9a3 3 0 0 1 3-3h.5l.7-2.1A2.5 2.5 0 0 1 13.6 2.5L14 2.6a2 2 0 0 1 1.2 2.5L14.5 8H19a2 2 0 0 1 1.9 2.6l-1.2 5A3 3 0 0 1 16.8 18H10a3 3 0 0 1-3-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
