import type { Product } from "@/lib/types";

/** Collapse case, spaces, and simple punctuation for matching / duplicates. */
export function normalizeProductText(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic/Urdu diacritics
    .replace(/[^\p{L}\p{N}\u0600-\u06FF]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productSearchHaystack(product: Pick<Product, "name" | "category" | "variant">): string {
  return normalizeProductText(`${product.name} ${product.category} ${product.variant}`);
}

/** Partial match anywhere (e.g. "condition" → "Hair Conditioner"). */
export function productMatchesQuery(
  product: Pick<Product, "name" | "category" | "variant">,
  query: string,
): boolean {
  const q = normalizeProductText(query);
  if (!q) return true;
  const hay = productSearchHaystack(product);
  return q.split(" ").every((token) => token && hay.includes(token));
}

export function filterProducts(
  products: Product[],
  query: string,
  category: string | null,
): Product[] {
  const cat = category ? normalizeProductText(category) : null;
  return products.filter((product) => {
    if (cat && normalizeProductText(product.category) !== cat) return false;
    return productMatchesQuery(product, query);
  });
}

export function uniqueCategories(products: Product[]): string[] {
  const seen = new Map<string, string>();
  for (const product of products) {
    const raw = product.category.trim();
    if (!raw) continue;
    const key = normalizeProductText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function findExactProduct(
  products: Product[],
  name: string,
  variant: string,
): Product | undefined {
  const n = normalizeProductText(name);
  const v = normalizeProductText(variant);
  return products.find(
    (p) => normalizeProductText(p.name) === n && normalizeProductText(p.variant) === v,
  );
}

export function findNameMatches(products: Product[], name: string, limit = 5): Product[] {
  const q = normalizeProductText(name);
  if (q.length < 2) return [];
  return products.filter((p) => normalizeProductText(p.name).includes(q)).slice(0, limit);
}

/** Soft "Did you mean…?" — one or two character edits on the normalized name. */
export function findSimilarProducts(products: Product[], name: string, limit = 3): Product[] {
  const target = normalizeProductText(name);
  if (target.length < 3) return [];
  const scored = products
    .map((product) => ({ product, d: levenshtein(target, normalizeProductText(product.name)) }))
    .filter(({ d, product }) => {
      const len = Math.max(target.length, normalizeProductText(product.name).length);
      return d > 0 && d <= 2 && d / len <= 0.35;
    })
    .sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map((s) => s.product);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

export const PAGE_SIZE = 50;

export function paginateProducts<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
}
