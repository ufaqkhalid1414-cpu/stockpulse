"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProductPhoto } from "@/components/ProductPhoto";
import { StockActionButtons } from "@/components/StockActions";
import { BackLabel, Lead } from "@/components/ui";
import { formatLowStockPlaceSummary } from "@/lib/low-stock";
import { t } from "@/lib/i18n";
import { lowStockProducts } from "@/lib/metrics";
import { useStock } from "@/lib/store";

export default function LowStockPage() {
  const { state, role } = useStock();
  const lang = state.language;
  const places = state.places;
  const products = lowStockProducts(state.products, places);
  const canMutate =
    role === "equal_owner" ||
    role === "co_owner" ||
    role === "staff_add" ||
    role === "staff_sell" ||
    role === "staff_move";
  const isOwner = role === "equal_owner" || role === "co_owner";

  return (
    <AppShell>
      <BackLabel label={t(lang, "back")} fallback="/dashboard" />
      <div className="mt-6">
        <Lead
          title={t(lang, "lowStock")}
          support={products.length === 0 ? t(lang, "lowNoneSupport") : t(lang, "lowLeadSupport")}
        />
      </div>

      {products.length === 0 ? (
        <div className="card mt-6 p-6">
          <p className="font-semibold text-navy">{t(lang, "lowNoneTitle")}</p>
          <p className="mt-1 text-sm text-navy/60">{t(lang, "lowNoneSupport")}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {products.map((product) => (
            <li key={product.id} className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <ProductPhoto src={product.photo} name={product.name} />
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{product.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-navy/75" dir="ltr">
                      {product.name}: {formatLowStockPlaceSummary(product, places)}
                    </p>
                  </div>
                </div>
                {isOwner ? (
                  <Link href={`/prices/${product.id}`} className="shrink-0 text-sm font-semibold text-navy/60">
                    {t(lang, "view")}
                  </Link>
                ) : null}
              </div>
              {canMutate ? (
                <div className="mt-4">
                  <StockActionButtons product={product} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
