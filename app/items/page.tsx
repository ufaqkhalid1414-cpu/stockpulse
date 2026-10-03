"use client";

import { ListScreen } from "@/components/ProductList";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function ItemsPage() {
  const { state, role } = useStock();
  const lang = state.language;
  const staffView = role === "staff_view";
  return (
    <ListScreen
      header={t(lang, "allItems", { count: state.products.length })}
      title={staffView ? t(lang, "staffViewLead") : t(lang, "itemsLead")}
      support={staffView ? t(lang, "staffViewSupport") : t(lang, "itemsLeadSupport")}
      products={state.products}
      emptyTitle={t(lang, "itemsEmptyTitle")}
      emptySupport={t(lang, "itemsEmptySupport")}
    />
  );
}
