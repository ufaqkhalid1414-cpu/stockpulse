import fs from "fs";
import path from "path";
import {
  getMonthlyPurchasePrices,
  getOwnerPhones,
  getProduct,
  getProducts,
  getRecentPurchasePrices,
  listBusinesses,
  type MonthlyPricePoint,
} from "@/lib/db/queries";
import { sendWhatsApp } from "@/lib/twilio";

/** True on the last calendar day of the month (UTC). Used by the month-end cron. */
export function isLastDayOfMonth(now = new Date()) {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.getUTCDate() === 1;
}

/** Build a monthly price-comparison SVG from actual purchases in each calendar month. */
export async function writeMonthlyPriceChart(
  businessId: string,
  productId: string,
  appBaseUrl?: string,
  options?: { months?: number },
) {
  const product = await getProduct(businessId, productId);
  if (!product) return null;

  const points = await getMonthlyPurchasePrices(productId, businessId, options?.months ?? 6);
  if (points.length === 0) return null;

  return writeChartSvg({
    title: `${product.name} — monthly prices`,
    points,
    filename: `chart-m-${businessId.slice(0, 8)}-${productId.slice(0, 8)}.svg`,
    appBaseUrl,
  });
}

/** @deprecated Use writeMonthlyPriceChart — kept as alias during rename. */
export async function writeWeeklyPriceChart(businessId: string, productId: string, appBaseUrl?: string) {
  return writeMonthlyPriceChart(businessId, productId, appBaseUrl);
}

export async function biggestRecentMove(businessId: string, productIds: string[]) {
  let best: { name: string; pct: number } | null = null;
  for (const id of productIds) {
    const prices = await getRecentPurchasePrices(id, businessId, 2);
    if (prices.length < 2 || prices[0] === 0) continue;
    const pct = ((prices[1] - prices[0]) / prices[0]) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      const product = await getProduct(businessId, id);
      if (product) best = { name: product.name, pct };
    }
  }
  return best;
}

/** Month-end job: send monthly comparison charts to every business's owners. */
export async function sendMonthlyChartsForAllBusinesses(appBaseUrl: string) {
  const results: {
    businessId: string;
    name: string;
    sent: number;
    skipped: string | null;
  }[] = [];

  for (const business of await listBusinesses()) {
    const ownerPhones = await getOwnerPhones(business.id);
    if (ownerPhones.length === 0) {
      results.push({ businessId: business.id, name: business.name, sent: 0, skipped: "no owners" });
      continue;
    }

    const allProducts = await getProducts(business.id);
    const products = [];
    for (const p of allProducts) {
      const months = await getMonthlyPurchasePrices(p.id, business.id, 2);
      if (months.length >= 1) products.push(p);
    }

    if (products.length === 0) {
      results.push({ businessId: business.id, name: business.name, sent: 0, skipped: "no purchase history" });
      continue;
    }

    // Prefer products that have both this month and last month of data; cap to avoid spam
    const ranked = [];
    for (const p of products) {
      ranked.push({ product: p, months: await getMonthlyPurchasePrices(p.id, business.id, 2) });
    }
    ranked.sort((a, b) => b.months.length - a.months.length);
    const top = ranked.slice(0, 5);

    let sent = 0;
    for (const { product } of top) {
      const media = await writeMonthlyPriceChart(business.id, product.id, appBaseUrl);
      if (!media) continue;
      const url = media.startsWith("http") ? media : `${appBaseUrl.replace(/\/$/, "")}${media}`;
      const caption = `${business.name} — monthly price comparison\n${product.name}: this month vs previous months`;
      for (const to of ownerPhones) {
        await sendWhatsApp(to, caption, url);
      }
      sent += 1;
    }

    results.push({
      businessId: business.id,
      name: business.name,
      sent,
      skipped: sent === 0 ? "chart generation failed" : null,
    });
  }

  return results;
}

async function writeChartSvg(input: {
  title: string;
  points: MonthlyPricePoint[];
  filename: string;
  appBaseUrl?: string;
}) {
  const max = Math.max(...input.points.map((p) => p.price), 1);
  const width = 640;
  const height = 360;
  const pad = 48;
  const barW = (width - pad * 2) / input.points.length - 12;

  const bars = input.points
    .map((point, index) => {
      const h = Math.max(8, (point.price / max) * (height - pad * 2));
      const x = pad + index * (barW + 12);
      const y = height - pad - h;
      const current = index === input.points.length - 1;
      const fill = current ? "#D9A947" : "#2D3B5E";
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${fill}" />
        <text x="${x + barW / 2}" y="${height - 18}" text-anchor="middle" font-size="14" fill="#2D3B5E">${escapeXml(point.label)}</text>
        <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" font-size="12" fill="#2D3B5E">${Math.round(point.price)}</text>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FAF6EE"/>
  <text x="${pad}" y="28" font-family="Segoe UI, Arial" font-size="18" font-weight="700" fill="#2D3B5E">${escapeXml(input.title)}</text>
  ${bars}
</svg>`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`stockpulse-charts/${input.filename}`, svg, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/svg+xml",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return blob.url;
    } catch (err) {
      console.error("[charts] blob upload failed", err);
    }
  }

  const dir = path.join(process.cwd(), "public", "generated");
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, input.filename);
    fs.writeFileSync(filePath, svg, "utf8");
    return input.appBaseUrl
      ? `${input.appBaseUrl.replace(/\/$/, "")}/generated/${input.filename}`
      : `/generated/${input.filename}`;
  } catch (err) {
    console.error("[charts] local write failed", err);
    return null;
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
