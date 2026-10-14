"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProductPhoto } from "@/components/ProductPhoto";
import { StockActionButtons } from "@/components/StockActions";
import { AppLink, BackLabel, Button, Lead, Num } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatQty } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { totalQty } from "@/lib/metrics";
import {
  filterProducts,
  PAGE_SIZE,
  paginateProducts,
  uniqueCategories,
} from "@/lib/product-search";
import { displayQty } from "@/lib/stock-math";
import { useStock } from "@/lib/store";
import type { Product } from "@/lib/types";
import { formatPricePerPiece } from "@/lib/units";

export function ProductRows({
  products,
  emptyTitle,
  emptySupport,
  emptyAction,
  readOnly = false,
}: {
  products: Product[];
  emptyTitle: string;
  emptySupport: string;
  emptyAction?: React.ReactNode;
  readOnly?: boolean;
}) {
  const { state, role } = useStock();
  const lang = state.language;
  const places = state.places?.length
    ? state.places
    : [
        { id: "warehouse", name: t(lang, "warehouse"), kind: "warehouse" as const },
        { id: "shop", name: t(lang, "shop"), kind: "shop" as const },
        { id: "online", name: t(lang, "online"), kind: "online" as const },
      ];
  const linkToPrices = !readOnly && (role === "equal_owner" || role === "co_owner");
  const canMutate =
    role === "equal_owner" ||
    role === "co_owner" ||
    role === "staff_add" ||
    role === "staff_sell" ||
    role === "staff_move";

  if (products.length === 0) {
    return (
      <div className="card mt-6 p-6">
        <p className="font-semibold text-navy">{emptyTitle}</p>
        <p className="mt-1 text-sm text-navy/60">{emptySupport}</p>
        {emptyAction ? <div className="mt-4">{emptyAction}</div> : null}
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {products.map((product) => {
        const body = (
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <ProductPhoto src={product.photo} name={product.name} />
              <div className="min-w-0">
                <p className="font-semibold text-navy">{product.name}</p>
                <p className="mt-1 text-sm text-navy/60">
                  {product.category}
                  {product.variant ? ` · ${product.variant}` : ""}
                </p>
                <p className="mt-1 text-sm font-medium text-navy/70" dir="ltr">
                  {formatPricePerPiece(product.purchasePrice, lang)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {places.map((place) => {
                    const raw = Number(product.stockByPlace?.[place.id] ?? (
                      place.id === "warehouse"
                        ? product.warehouseQty
                        : place.id === "shop"
                          ? product.shopQty
                          : place.id === "online"
                            ? product.onlineQty ?? 0
                            : 0
                    ));
                    const needsRecount =
                      Boolean(product.recountByPlace?.[place.id]) ||
                      (place.id === "warehouse" && Boolean(product.needsRecountWarehouse)) ||
                      (place.id === "shop" && Boolean(product.needsRecountShop)) ||
                      (place.id === "online" && Boolean(product.needsRecountOnline)) ||
                      raw < 0;
                    return (
                      <LocationQtyBadge
                        key={place.id}
                        lang={lang}
                        placeName={place.name}
                        raw={raw}
                        needsRecount={needsRecount}
                      />
                    );
                  })}
                </div>
                {places.some((place) => {
                  const raw = Number(product.stockByPlace?.[place.id] ?? 0);
                  return (
                    Boolean(product.recountByPlace?.[place.id]) ||
                    raw < 0 ||
                    (place.id === "warehouse" && product.needsRecountWarehouse) ||
                    (place.id === "shop" && product.needsRecountShop) ||
                    (place.id === "online" && product.needsRecountOnline)
                  );
                }) ? (
                  <p className="mt-2 text-xs leading-relaxed text-navy/65">{t(lang, "needsRecountHint")}</p>
                ) : null}
              </div>
            </div>
            <div className="text-end">
              <Num className="text-3xl font-bold tracking-tight text-navy">{formatQty(totalQty(product))}</Num>
              <p className="mt-0.5 text-xs font-medium text-navy/50">{t(lang, "unitPieces")}</p>
            </div>
          </div>
        );
        return (
          <li key={product.id} className="space-y-2">
            {linkToPrices ? (
              <AppLink href={`/prices/${product.id}`} className="card lift block p-5">
                {body}
              </AppLink>
            ) : (
              <div className="card p-5">{body}</div>
            )}
            {canMutate ? <StockActionButtons product={product} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function LocationQtyBadge({
  lang,
  placeName,
  raw,
  needsRecount,
}: {
  lang: Lang;
  placeName: string;
  raw: number;
  needsRecount: boolean;
}) {
  const shown = displayQty(raw);
  if (shown <= 0 && !needsRecount) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-navy">
        {placeName}: {formatQty(shown)} {t(lang, "unitPieces")}
      </span>
      {needsRecount ? (
        <span className="rounded-full border border-navy/15 bg-white px-2.5 py-1 text-xs font-semibold text-navy/80">
          {t(lang, "needsRecountBadge")}
        </span>
      ) : null}
    </span>
  );
}

export function ListScreen({
  header,
  title,
  support,
  products,
  emptyTitle,
  emptySupport,
}: {
  header: string;
  title: string;
  support: string;
  products: Product[];
  emptyTitle: string;
  emptySupport: string;
}) {
  const { state, role, homePath } = useStock();
  const lang = state.language;
  const isStaff =
    role === "staff_add" || role === "staff_view" || role === "staff_sell" || role === "staff_move";
  const isOwner = role === "equal_owner" || role === "co_owner";
  const canAdd = role === "equal_owner" || role === "co_owner" || role === "staff_add";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const categories = useMemo(() => uniqueCategories(products), [products]);
  const filtered = useMemo(() => filterProducts(products, query, category), [products, query, category]);
  const visible = useMemo(() => paginateProducts(filtered, page), [filtered, page]);
  const hasMore = visible.length < filtered.length;

  function onSearchChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  const searching = query.trim() !== "" || category !== null;

  return (
    <AppShell>
      {!isStaff ? <BackLabel label={t(lang, "back")} fallback={homePath || "/dashboard"} /> : null}
      <div className={isStaff ? "" : "mt-6"}>
        <Lead title={title} support={support} />
      </div>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy/80">{t(lang, "searchProducts")}</span>
          <VoiceInput
            id="product-search"
            lang={lang}
            value={query}
            onChange={onSearchChange}
            placeholder={t(lang, "searchPlaceholder")}
          />
        </label>

        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t(lang, "searchAllCategories")}>
            <CategoryChip
              active={category === null}
              label={t(lang, "searchAllCategories")}
              onClick={() => {
                setCategory(null);
                setPage(1);
              }}
            />
            {categories.map((cat) => (
              <CategoryChip
                key={cat}
                active={category === cat}
                label={cat}
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
              />
            ))}
          </div>
        ) : null}

        {isOwner ? (
          <div>
            <Button href="/import" variant="secondary" className="min-h-[48px] px-5">
              {t(lang, "importProducts")}
            </Button>
          </div>
        ) : null}
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy">
        {searching
          ? t(lang, "allItems", { count: filtered.length })
          : header}
      </h2>

      <ProductRows
        products={visible}
        emptyTitle={searching ? t(lang, "searchNoResults") : emptyTitle}
        emptySupport={searching ? t(lang, "searchNoResults") : emptySupport}
        emptyAction={
          searching && canAdd ? (
            <Link
              href={`/add-product?name=${encodeURIComponent(query.trim())}`}
              className="depth lift inline-flex min-h-[48px] items-center rounded-full bg-navy px-5 text-sm font-semibold text-cream"
            >
              {t(lang, "searchAddThis")}
            </Link>
          ) : null
        }
        readOnly={isStaff}
      />

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="depth lift inline-flex min-h-[48px] items-center rounded-full border border-navy/20 bg-white px-5 text-sm font-semibold text-navy"
            onClick={() => setPage((p) => p + 1)}
          >
            {t(lang, "searchShowMore")}
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center rounded-full px-3.5 text-sm font-semibold ${
        active ? "bg-navy text-cream" : "border border-navy/15 bg-white text-navy/75"
      }`}
    >
      {label}
    </button>
  );
}
