import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/session";
import {
  addProduct,
  addStaff,
  buildBusinessState,
  recordPurchasePrice,
  recordSale,
  runBackup,
  updateBusiness,
} from "@/lib/db/queries";
import { sendWhatsApp, twilioConfigured } from "@/lib/twilio";
import { biggestRecentMove, writeWeeklyPriceChart } from "@/lib/charts";
import { totalQty } from "@/lib/metrics";
import type { Lang } from "@/lib/i18n";
import type { Location, Permission } from "@/lib/types";

export const runtime = "nodejs";

function baseUrl(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET() {
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "No business selected" }, { status: 401 });
  return NextResponse.json({ business: buildBusinessState(business.id) });
}

export async function PATCH(request: Request) {
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "No business selected" }, { status: 401 });
  const body = (await request.json()) as {
    name?: string;
    language?: Lang;
    ownerWhatsapp?: string | null;
    priceThreshold?: number;
  };
  updateBusiness(business.id, {
    name: body.name,
    language: body.language,
    ownerWhatsapp: body.ownerWhatsapp,
    priceThreshold: body.priceThreshold,
  });
  return NextResponse.json({ business: buildBusinessState(business.id) });
}

export async function POST(request: Request) {
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "No business selected" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action || "");

  try {
    if (action === "addProduct") {
      const product = addProduct(business.id, {
        name: String(body.name || ""),
        category: String(body.category || ""),
        variant: String(body.variant || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
        purchasePrice: Number(body.purchasePrice),
        photo: body.photo ? String(body.photo) : undefined,
      });
      return NextResponse.json({ product, business: buildBusinessState(business.id) });
    }

    if (action === "addStaff") {
      const staff = addStaff(business.id, {
        name: String(body.name || ""),
        phone: String(body.phone || ""),
        permission: (body.permission as Permission) || "view",
      });
      return NextResponse.json({ staff, business: buildBusinessState(business.id) });
    }

    if (action === "recordSale") {
      const product = recordSale(business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
      });
      return NextResponse.json({ product, business: buildBusinessState(business.id) });
    }

    if (action === "recordPurchasePrice") {
      const { product, alert } = recordPurchasePrice(
        business.id,
        String(body.productId || ""),
        Number(body.price),
      );
      if (alert && business.owner_whatsapp) {
        const msg = `${alert.title}\n${alert.body}`;
        await sendWhatsApp(business.owner_whatsapp, msg).catch((err) => console.error(err));
      }
      return NextResponse.json({
        product,
        alert,
        business: buildBusinessState(business.id),
        twilioConfigured: twilioConfigured(),
      });
    }

    if (action === "backup") {
      const result = runBackup(business.id);
      return NextResponse.json({ backup: result, business: buildBusinessState(business.id) });
    }

    if (action === "sendDailyReport") {
      const state = buildBusinessState(business.id)!;
      const total = state.products.reduce((sum, p) => sum + totalQty(p) * p.purchasePrice, 0);
      const low = state.products.filter((p) => totalQty(p) < p.restockThreshold);
      const move = biggestRecentMove(
        business.id,
        state.products.map((p) => p.id),
      );
      const lang = state.language;
      const lines =
        lang === "ur"
          ? [
              `${state.businessName} — روزانہ رپورٹ`,
              `کل اسٹاک قیمت: Rs ${Math.round(total)}`,
              move
                ? `بڑی قیمت تبدیلی: ${move.name} (${move.pct > 0 ? "+" : ""}${move.pct.toFixed(1)}%)`
                : "کوئی بڑی قیمت تبدیلی نہیں",
              low.length
                ? `کم اسٹاک: ${low.map((p) => p.name).slice(0, 3).join(", ")}`
                : "اسٹاک ٹھیک لگ رہا ہے",
            ]
          : [
              `${state.businessName} — daily stock report`,
              `Total stock value: Rs ${Math.round(total)}`,
              move
                ? `Biggest price move: ${move.name} (${move.pct > 0 ? "+" : ""}${move.pct.toFixed(1)}%)`
                : "No big price moves",
              low.length
                ? `Low stock: ${low.map((p) => p.name).slice(0, 3).join(", ")}`
                : "Stock levels look fine",
            ];
      const to = business.owner_whatsapp || String(body.to || "");
      if (!to) return NextResponse.json({ error: "Set an owner WhatsApp number first" }, { status: 400 });
      const sent = await sendWhatsApp(to, lines.join("\n"));
      return NextResponse.json({ sent, preview: lines.join("\n"), twilioConfigured: twilioConfigured() });
    }

    if (action === "sendWeeklyChart") {
      const productId = String(body.productId || "") || buildBusinessState(business.id)?.products[0]?.id || "";
      if (!productId) return NextResponse.json({ error: "No product for chart" }, { status: 400 });
      const relative = writeWeeklyPriceChart(business.id, productId);
      if (!relative) return NextResponse.json({ error: "No price history" }, { status: 400 });
      const to = business.owner_whatsapp || String(body.to || "");
      if (!to) return NextResponse.json({ error: "Set an owner WhatsApp number first" }, { status: 400 });
      const media = `${baseUrl(request)}${relative}`;
      const sent = await sendWhatsApp(to, "Weekly price comparison", media);
      return NextResponse.json({ sent, media, twilioConfigured: twilioConfigured() });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
