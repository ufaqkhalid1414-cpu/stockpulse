"use client";

import { ListScreen } from "@/components/ProductList";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function ItemsPage() {
  const { state } = useStock();
  const lang = state.language;
  return (
    <ListScreen
      header={t(lang, "allItems", { count: state.products.length })}
      title={t(lang, "itemsLead")}
      support={t(lang, "itemsLeadSupport")}
      products={state.products}
      emptyTitle={t(lang, "itemsEmptyTitle")}
      emptySupport={t(lang, "itemsEmptySupport")}
    />
  );
}
