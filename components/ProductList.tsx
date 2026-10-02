"use client";

import { AppShell } from "@/components/AppShell";
import { ProductPhoto } from "@/components/ProductPhoto";
import { AppLink, BackLabel, Lead, Num } from "@/components/ui";
import { formatQty } from "@/lib/format";
import { t } from "@/lib/i18n";
import { totalQty } from "@/lib/metrics";
import { useStock } from "@/lib/store";
import type { Product } from "@/lib/types";

export function ProductRows({
  products,
  emptyTitle,
  emptySupport,
}: {
  products: Product[];
  emptyTitle: string;
  emptySupport: string;
}) {
  const { state } = useStock();
  const lang = state.language;

  if (products.length === 0) {
    return (
      <div className="card mt-6 p-6">
        <p className="font-semibold text-navy">{emptyTitle}</p>
        <p className="mt-1 text-sm text-navy/60">{emptySupport}</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {products.map((product) => (
        <li key={product.id}>
          <AppLink href={`/prices/${product.id}`} className="card lift block p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <ProductPhoto src={product.photo} name={product.name} />
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{product.name}</p>
                  <p className="mt-1 text-sm text-navy/60">
                    {product.category}
                    {product.variant ? ` · ${product.variant}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.warehouseQty > 0 ? (
                      <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-navy">
                        {t(lang, "badgeWarehouse", { count: formatQty(product.warehouseQty) })}
                      </span>
                    ) : null}
                    {product.shopQty > 0 ? (
                      <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-navy">
                        {t(lang, "badgeShop", { count: formatQty(product.shopQty) })}
                      </span>
                    ) : null}
                    {(product.onlineQty ?? 0) > 0 ? (
                      <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-navy">
                        {t(lang, "badgeOnline", { count: formatQty(product.onlineQty) })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <Num className="text-3xl font-bold tracking-tight text-navy">{formatQty(totalQty(product))}</Num>
            </div>
          </AppLink>
        </li>
      ))}
    </ul>
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
  const { state } = useStock();
  return (
    <AppShell>
      <BackLabel label={t(state.language, "back")} fallback="/dashboard" />
      <div className="mt-6">
        <Lead title={title} support={support} />
      </div>
      <h2 className="mt-8 text-lg font-bold text-navy">{header}</h2>
      <ProductRows products={products} emptyTitle={emptyTitle} emptySupport={emptySupport} />
    </AppShell>
  );
}
