"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { Button, Field, Lead, BackLabel } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { t } from "@/lib/i18n";
import { readPhoto } from "@/lib/photo";
import { markScrollTop } from "@/lib/scroll";
import { useStock } from "@/lib/store";
import type { Location } from "@/lib/types";
import { formatPricePerCarton, formatPricePerPiece, piecePriceFromCarton } from "@/lib/units";

type PriceUnit = "piece" | "carton";

export default function AddProductPage() {
  const { state, addProduct, role, homePath } = useStock();
  const lang = state.language;
  const router = useRouter();
  const isStaff = role === "staff_add" || role === "staff_view";
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState<Location>("warehouse");
  const [quantity, setQuantity] = useState("1");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("piece");
  const [price, setPrice] = useState("");
  const [piecesPerCarton, setPiecesPerCarton] = useState("");
  const [threshold, setThreshold] = useState("");
  const [variant, setVariant] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

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
    if (Object.keys(next).length > 0) return;
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
        setShowSuccess(true);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          setShowSuccess(false);
          markScrollTop();
          router.push(isStaff ? "/add-product" : "/dashboard", { scroll: false });
        }, 1600);
      })
      .catch(() => {
        /* store surfaces the error; do not show success */
      });
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

  return (
    <AppShell>
      {showSuccess ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-10"
          role="status"
          aria-live="polite"
        >
          <div className="depth inline-flex items-center gap-2.5 rounded-full bg-sage px-4 py-3 text-sm font-semibold text-pine shadow-[var(--shadow-lift)]">
            <ThumbsUpIcon />
            <span>{t(lang, "productAddedSuccess")}</span>
          </div>
        </div>
      ) : null}
      <div className="max-w-lg">
        {!isStaff ? <BackLabel label={t(lang, "back")} fallback={homePath || "/dashboard"} /> : null}
        <div className={isStaff ? "" : "mt-6"}>
          <Lead title={t(lang, "addTitle")} support={t(lang, "addSupport")} />
        </div>
        <form className="card mt-6 space-y-5 p-5 sm:p-6" onSubmit={submit}>
          <Field id="name" label={t(lang, "productName")} error={errors.name}>
            <VoiceInput id="name" lang={lang} value={name} onChange={setName} placeholder={t(lang, "productNamePlaceholder")} />
          </Field>
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
              options={[
                { value: "warehouse", label: t(lang, "warehouse") },
                { value: "shop", label: t(lang, "shop") },
                { value: "online", label: t(lang, "online") },
              ]}
              onChange={(value) => setLocation(value as Location)}
            />
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

          <Button type="submit" full>
            {t(lang, "save")}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-pine">
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
