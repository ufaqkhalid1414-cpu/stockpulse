import fs from "fs";
import path from "path";
import { getProduct, getRecentPurchasePrices } from "@/lib/db/queries";

/** Build a simple SVG bar chart from real price history and save as a file Twilio can fetch. */
export function writeWeeklyPriceChart(businessId: string, productId: string) {
  const product = getProduct(businessId, productId);
  if (!product || product.priceHistory.length === 0) return null;

  const points = product.priceHistory.slice(-6);
  const max = Math.max(...points.map((p) => p.price), 1);
  const width = 640;
  const height = 360;
  const pad = 48;
  const barW = (width - pad * 2) / points.length - 12;

  const bars = points
    .map((point, index) => {
      const h = Math.max(8, (point.price / max) * (height - pad * 2));
      const x = pad + index * (barW + 12);
      const y = height - pad - h;
      const current = index === points.length - 1;
      const fill = current ? "#D9A947" : "#2D3B5E";
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${fill}" />
        <text x="${x + barW / 2}" y="${height - 18}" text-anchor="middle" font-size="14" fill="#2D3B5E">${point.month}</text>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FAF6EE"/>
  <text x="${pad}" y="28" font-family="Segoe UI, Arial" font-size="18" font-weight="700" fill="#2D3B5E">${escapeXml(product.name)} — prices</text>
  ${bars}
</svg>`;

  const dir = path.join(process.cwd(), "public", "generated");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `chart-${businessId.slice(0, 8)}-${productId.slice(0, 8)}.svg`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, svg, "utf8");
  return `/generated/${filename}`;
}

export function biggestRecentMove(businessId: string, productIds: string[]) {
  let best: { name: string; pct: number } | null = null;
  for (const id of productIds) {
    const prices = getRecentPurchasePrices(id, businessId, 2);
    if (prices.length < 2 || prices[0] === 0) continue;
    const pct = ((prices[1] - prices[0]) / prices[0]) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      const product = getProduct(businessId, id);
      if (product) best = { name: product.name, pct };
    }
  }
  return best;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
