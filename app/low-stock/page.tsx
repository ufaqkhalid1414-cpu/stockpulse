"use client";

import { ListScreen } from "@/components/ProductList";
import { t } from "@/lib/i18n";
import { lowStockProducts } from "@/lib/metrics";
import { useStock } from "@/lib/store";

export default function LowStockPage() {
  const { state } = useStock();
  const lang = state.language;
  const products = lowStockProducts(state.products);
  return (
    <ListScreen
      header={t(lang, "lowStock")}
      title={products.length === 0 ? t(lang, "lowNoneTitle") : t(lang, "lowLead")}
      support={products.length === 0 ? t(lang, "lowNoneSupport") : t(lang, "lowLeadSupport")}
      products={products}
      emptyTitle={t(lang, "lowNoneTitle")}
      emptySupport={t(lang, "lowNoneSupport")}
    />
  );
}
