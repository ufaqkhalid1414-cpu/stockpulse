import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { requireBusiness, getSession } from "@/lib/session";
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
  await ensureDbReady();
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
  return NextResponse.json({ business: buildBusinessState(business.id) });
}

export async function PATCH(request: Request) {
  await ensureDbReady();
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
  const body = (await request.json()) as {
    name?: string;
    language?: Lang;
    ownerWhatsapp?: string | null;
    priceThreshold?: number;
  };
  updateBusiness(business.id, {
    name: body.name,
    language: body.language,
    // Owner WhatsApp is the login identity — keep it locked to the verified session phone
    ownerWhatsapp: (await getSession())?.phone ?? business.owner_whatsapp,
    priceThreshold: body.priceThreshold,
  });
  await persistDb();
  return NextResponse.json({ business: buildBusinessState(business.id) });
}

export async function POST(request: Request) {
  await ensureDbReady();
  const business = await requireBusiness();
  if (!business) return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
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
      await persistDb();
      return NextResponse.json({ product, business: buildBusinessState(business.id) });
    }

    if (action === "addStaff") {
      const staff = addStaff(business.id, {
        name: String(body.name || ""),
        phone: String(body.phone || ""),
        permission: (body.permission as Permission) || "view",
      });
      await persistDb();
      return NextResponse.json({ staff, business: buildBusinessState(business.id) });
    }

    if (action === "recordSale") {
      const product = recordSale(business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
      });
      await persistDb();
      return NextResponse.json({ product, business: buildBusinessState(business.id) });
    }

    if (action === "recordPurchasePrice") {
      const { product, alert } = recordPurchasePrice(
        business.id,
        String(body.productId || ""),
        Number(body.price),
      );
      let whatsappError: string | null = null;
      if (alert && business.owner_whatsapp) {
        try {
          const sent = await sendWhatsApp(business.owner_whatsapp, `${alert.title}\n${alert.body}`);
          if (sent.skipped) {
            whatsappError = "Price saved. WhatsApp alert was not sent — Twilio is not configured.";
          }
        } catch (err) {
          whatsappError =
            err instanceof Error ? err.message : "Price saved, but WhatsApp alert failed to send.";
        }
      }
      await persistDb();
      return NextResponse.json({
        product,
        alert,
        business: buildBusinessState(business.id),
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "backup") {
      const result = runBackup(business.id);
      await persistDb();
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
      const relative = await writeWeeklyPriceChart(business.id, productId, baseUrl(request));
      if (!relative) return NextResponse.json({ error: "No price history" }, { status: 400 });
      const to = business.owner_whatsapp || String(body.to || "");
      if (!to) return NextResponse.json({ error: "Set an owner WhatsApp number first" }, { status: 400 });
      const media = relative.startsWith("http") ? relative : `${baseUrl(request)}${relative}`;
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
