import type { ShopifySyncItem } from "@/lib/db/queries";

const API_VERSION = "2024-10";

export function normalizeShopDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/$/, "");
  value = value.replace(/\/admin.*$/, "");
  if (!value.includes(".")) {
    value = `${value}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Error("Enter your store as your-store.myshopify.com");
  }
  return value;
}

type ShopifyVariant = {
  id: number | string;
  title?: string;
  price?: string;
  inventory_quantity?: number | null;
  sku?: string | null;
};

type ShopifyProduct = {
  id: number | string;
  title?: string;
  product_type?: string;
  status?: string;
  variants?: ShopifyVariant[];
};

async function shopifyFetch(shopDomain: string, accessToken: string, path: string) {
  const url = `https://${shopDomain}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { errors?: string })?.errors || text || `Shopify error (${res.status})`;
    throw new Error(typeof err === "string" ? err : "Shopify request failed. Check the domain and Admin API token.");
  }
  return json as Record<string, unknown>;
}

/** Verifies credentials by reading shop name. */
export async function testShopifyConnection(shopDomain: string, accessToken: string) {
  const data = await shopifyFetch(shopDomain, accessToken, "/shop.json");
  const shop = data.shop as { name?: string } | undefined;
  return { ok: true as const, name: shop?.name || shopDomain };
}

/** Pull active products/variants into sync items (online qty = inventory_quantity). */
export async function fetchShopifyCatalog(shopDomain: string, accessToken: string): Promise<ShopifySyncItem[]> {
  const items: ShopifySyncItem[] = [];
  let pageInfo: string | null = null;

  for (let guard = 0; guard < 20; guard += 1) {
    const requestPath: string = pageInfo
      ? `/products.json?limit=50&page_info=${encodeURIComponent(pageInfo)}`
      : `/products.json?limit=50&status=active`;

    const res: Response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}${requestPath}`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let json: { products?: ShopifyProduct[]; errors?: string } = {};
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      throw new Error("Shopify returned an invalid response");
    }
    if (!res.ok) {
      throw new Error(json.errors || `Shopify products failed (${res.status})`);
    }

    for (const product of json.products || []) {
      const name = (product.title || "Untitled").trim();
      const category = (product.product_type || "Shopify").trim() || "Shopify";
      for (const variant of product.variants || []) {
        const variantTitle = (variant.title || "").trim();
        const variantLabel = !variantTitle || variantTitle.toLowerCase() === "default title" ? "" : variantTitle;
        items.push({
          shopifyVariantId: String(variant.id),
          name,
          category,
          variant: variantLabel,
          onlineQty: Math.max(0, Number(variant.inventory_quantity ?? 0)),
          purchasePrice: Math.max(0, Number(variant.price || 0)),
        });
      }
    }

    const link: string = res.headers.get("link") || "";
    const nextMatch: RegExpMatchArray | null = link.match(
      /<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/i,
    );
    pageInfo = nextMatch ? decodeURIComponent(nextMatch[1]) : null;
    if (!pageInfo) break;
  }

  return items;
}
