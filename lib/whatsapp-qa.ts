import { totalQty } from "@/lib/metrics";
import type { Lang } from "@/lib/i18n";
import {
  findProductByName,
  getProducts,
  getTopSeller,
  type BusinessRow,
} from "@/lib/db/queries";

function qtyLine(lang: Lang, warehouse: number, shop: number, online: number) {
  if (lang === "ur") {
    return `گودام: ${warehouse}، دکان: ${shop}، آن لائن: ${online}`;
  }
  return `Warehouse: ${warehouse}, Shop: ${shop}, Online: ${online}`;
}

export function answerWhatsAppQuestion(business: BusinessRow, raw: string): string {
  const text = raw.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const lang = business.language;

  // Stock questions
  const stockMatch =
    lower.match(/(?:how much stock(?: of)?|stock of|stock kitna(?: hai)?(?: of)?)\s+(.+?)[\?؟!.]*$/i) ||
    lower.match(/^(.+?)\s+(?:stock kitna hai|kitna stock|kitni hai)[\?؟!.]*$/i) ||
    lower.match(/^(.+?)\s+stock[\?؟!.]*$/i);

  if (stockMatch || /stock kitna|how much stock|kitna stock/.test(lower)) {
    let name = stockMatch?.[1]?.trim() || "";
    name = name.replace(/^(of|for)\s+/i, "").replace(/[?؟!.]+$/, "").trim();
    if (!name) {
      // try pull product name from free text
      const products = getProducts(business.id);
      const hit = products.find((p) => lower.includes(p.name.toLowerCase()));
      if (hit) name = hit.name;
    }
    const product = name ? findProductByName(business.id, name) : null;
    if (!product) {
      return lang === "ur"
        ? "مجھے وہ چیز نہیں ملی۔ نام دوبارہ بھیجیں، مثلاً: Basmati Rice stock kitna hai?"
        : "I couldn't find that product. Try again like: how much stock of Basmati Rice";
    }
    const total = totalQty(product);
    if (lang === "ur") {
      return `${product.name}: کل ${total}۔ ${qtyLine(lang, product.warehouseQty, product.shopQty, product.onlineQty)}`;
    }
    return `${product.name}: ${total} in total. ${qtyLine(lang, product.warehouseQty, product.shopQty, product.onlineQty)}`;
  }

  // Best seller / profit
  if (
    /sabse zyada profit|best selling|best seller|top product|zyada profit|most profit|best product/.test(
      lower,
    )
  ) {
    const top = getTopSeller(business.id);
    if (!top) {
      return lang === "ur"
        ? "ابھی فروخت کا کافی ڈیٹا نہیں ہے۔ جب آپ فروخت ریکارڈ کریں گے، میں بتا سکوں گا۔"
        : "Not enough sales data yet. Record a few sales and ask again.";
    }
    if (lang === "ur") {
      return `سب سے زیادہ قدر والی چیز: ${top.name} (تقریباً Rs ${Math.round(top.value)})`;
    }
    return `Top by recent sales value: ${top.name} (about Rs ${Math.round(top.value)})`;
  }

  // Graceful fallback
  if (lang === "ur") {
    return "میں نے سمجھ نہیں پایا۔ پوچھ سکتے ہیں: \"Basmati Rice stock kitna hai?\" یا \"sabse zyada profit kis product se hua\"";
  }
  return 'I didn\'t catch that. Try: "how much stock of Basmati Rice" or "best selling product"';
}
