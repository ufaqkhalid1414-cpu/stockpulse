"use client";

import { useRef, useState } from "react";
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
  const [price, setPrice] = useState("");
  const [variant, setVariant] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t(lang, "fieldRequired");
    if (!category.trim()) next.category = t(lang, "fieldRequired");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || quantity.trim() === "") next.quantity = t(lang, "qtyInvalid");
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) next.price = t(lang, "priceInvalid");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    void addProduct({
      name,
      category,
      variant,
      location,
      quantity: qty,
      purchasePrice: amount,
      photo,
    }).then(() => {
      markScrollTop();
      router.push(isStaff ? "/add-product" : "/dashboard", { scroll: false });
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
      <div className="max-w-lg">
        {!isStaff ? <BackLabel label={t(lang, "back")} fallback={homePath || "/dashboard"} /> : null}
        <div className={isStaff ? "" : "mt-6"}>
          <Lead title={t(lang, "addTitle")} support={t(lang, "addSupport")} />
        </div>
        <form className="card mt-6 space-y-5 p-5 sm:p-6" onSubmit={submit}>
          <Field id="name" label={t(lang, "productName")} error={errors.name}>
            <VoiceInput id="name" lang={lang} value={name} onChange={setName} placeholder={t(lang, "productNamePlaceholder")} />
          </Field>
          <Field id="category" label={t(lang, "category")} error={errors.category}>
            <VoiceInput id="category" lang={lang} value={category} onChange={setCategory} placeholder={t(lang, "categoryPlaceholder")} />
          </Field>
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
          <Field id="price" label={t(lang, "purchasePrice")} error={errors.price}>
            <VoiceInput id="price" lang={lang} inputMode="decimal" value={price} onChange={setPrice} placeholder="0" />
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
