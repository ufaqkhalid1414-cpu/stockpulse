"use client";

import { useState } from "react";
import { ListScreen } from "@/components/ProductList";
import { ProductPhoto } from "@/components/ProductPhoto";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function ItemsPage() {
  const { state, role } = useStock();
  const lang = state.language;
  const staffView = role === "staff_view";
  const isOwner = role === "equal_owner" || role === "co_owner";
  const staffLead =
    role === "staff_sell"
      ? t(lang, "staffSellLead")
      : role === "staff_move"
        ? t(lang, "staffMoveLead")
        : staffView
          ? t(lang, "staffViewLead")
          : t(lang, "itemsLead");
  const staffSupport =
    role === "staff_sell"
      ? t(lang, "staffSellSupport")
      : role === "staff_move"
        ? t(lang, "staffMoveSupport")
        : staffView
          ? t(lang, "staffViewSupport")
          : t(lang, "itemsLeadSupport");
  return (
    <>
      <ListScreen
        header={t(lang, "allItems", { count: state.products.length })}
        title={staffLead}
        support={staffSupport}
        products={state.products}
        emptyTitle={t(lang, "itemsEmptyTitle")}
        emptySupport={t(lang, "itemsEmptySupport")}
      />
      {isOwner ? <ArchivedProductsPanel /> : null}
    </>
  );
}

function ArchivedProductsPanel() {
  const { state, restoreProduct } = useStock();
  const lang = state.language;
  const archived = state.archivedProducts ?? [];
  const [open, setOpen] = useState(false);

  if (archived.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 pb-10 sm:px-8">
      <button
        type="button"
        className="depth lift mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-navy"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {t(lang, "archivedProductsSection")} ({archived.length})
      </button>
      {open ? (
        <ul className="mt-3 space-y-2">
          {archived.map((product) => (
            <li key={product.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProductPhoto src={product.photo} name={product.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{product.name}</p>
                  <p className="truncate text-sm text-navy/55">{t(lang, "archivedProductsSupport")}</p>
                </div>
              </div>
              <button
                type="button"
                className="depth lift shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-cream"
                onClick={() => void restoreProduct(product.id)}
              >
                {t(lang, "actionRestore")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
