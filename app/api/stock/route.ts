import { NextResponse } from "next/server";
import {
  canAddProduct,
  canAccessPrices,
  canManageOwners,
  canManagePeople,
  canResetBusiness,
  canSendReports,
  requireAccess,
  requireOwnerAccess,
} from "@/lib/access";
import { ensureDbReady, persistDb } from "@/lib/db";
import { actorFromAccess, recordActivity, type ActivityInput } from "@/lib/db/activity";

async function safeRecordActivity(businessId: string, input: ActivityInput) {
  try {
    await recordActivity(businessId, input);
  } catch (err) {
    console.error("[activity] failed to write history after successful change", err);
  }
}
import {
  addOwner,
  addProduct,
  addStaff,
  buildBusinessState,
  getOwnerPhones,
  getOwners,
  recordPurchasePrice,
  recordSale,
  removeOwner,
  runBackup,
  updateBusiness,
} from "@/lib/db/queries";
import { sendWhatsApp, twilioConfigured } from "@/lib/twilio";
import { biggestRecentMove, writeMonthlyPriceChart } from "@/lib/charts";
import { totalQty } from "@/lib/metrics";
import type { Lang } from "@/lib/i18n";
import type { Location, OwnerAccess, Permission } from "@/lib/types";

export const runtime = "nodejs";

function baseUrl(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function forbidden(message = "You do not have permission for this action") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET() {
  await ensureDbReady();
  const ctx = await requireAccess();
  if (!ctx) return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
  return NextResponse.json({
    business: await buildBusinessState(ctx.business.id),
    role: ctx.role,
  });
}

export async function PATCH(request: Request) {
  await ensureDbReady();
  const ctx = await requireOwnerAccess();
  if (!ctx) return NextResponse.json({ error: "Please log in as an owner" }, { status: 403 });
  const data = (await request.json()) as {
    name?: string;
    language?: Lang;
    priceThreshold?: number;
    ownerWhatsapp?: string | null;
  };
  // Primary WhatsApp is equal-owner only (critical account setting)
  if (data.ownerWhatsapp !== undefined && ctx.role !== "equal_owner") {
    return forbidden("Only equal owners can change the primary WhatsApp number");
  }
  const before = ctx.business;
  await updateBusiness(ctx.business.id, {
    name: data.name,
    language: data.language,
    priceThreshold: data.priceThreshold,
    ownerWhatsapp: data.ownerWhatsapp === undefined ? undefined : data.ownerWhatsapp,
  });
  const changes: string[] = [];
  if (data.name !== undefined && data.name.trim() !== before.name) {
    changes.push(`Business name: "${before.name}" → "${data.name.trim()}"`);
  }
  if (data.language !== undefined && data.language !== before.language) {
    changes.push(`Language: ${before.language} → ${data.language}`);
  }
  if (data.priceThreshold !== undefined && data.priceThreshold !== before.price_threshold) {
    changes.push(`Price alert threshold: ${before.price_threshold}% → ${data.priceThreshold}%`);
  }
  if (data.ownerWhatsapp !== undefined) {
    const next = data.ownerWhatsapp;
    if (next !== before.owner_whatsapp) {
      changes.push(`Primary WhatsApp: ${before.owner_whatsapp || "—"} → ${next || "—"}`);
    }
  }
  if (changes.length > 0) {
    await safeRecordActivity(ctx.business.id, {
      category: "settings",
      action: "settings_changed",
      actor: actorFromAccess(ctx),
      summary: "Changed business settings",
      detail: changes.join("; "),
      previousValue: data.priceThreshold !== undefined ? before.price_threshold : null,
      newValue: data.priceThreshold !== undefined ? data.priceThreshold : null,
    });
  }
  await persistDb();
  return NextResponse.json({ business: await buildBusinessState(ctx.business.id), role: ctx.role });
}

export async function POST(request: Request) {
  await ensureDbReady();
  const ctx = await requireAccess();
  if (!ctx) return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action || "");

  try {
    if (action === "addProduct") {
      if (!canAddProduct(ctx.role)) return forbidden("View-only staff cannot add products");
      const rawThreshold = body.restockThreshold;
      const parsedThreshold =
        rawThreshold === undefined || rawThreshold === null || String(rawThreshold).trim() === ""
          ? undefined
          : Number(rawThreshold);
      const rawPpc = body.piecesPerCarton;
      const parsedPpc =
        rawPpc === undefined || rawPpc === null || String(rawPpc).trim() === ""
          ? null
          : Number(rawPpc);
      const { product, audit } = await addProduct(ctx.business.id, {
        name: String(body.name || ""),
        category: String(body.category || ""),
        variant: String(body.variant || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
        purchasePrice: Number(body.purchasePrice),
        photo: body.photo ? String(body.photo) : undefined,
        restockThreshold: parsedThreshold,
        piecesPerCarton: parsedPpc,
      });
      await safeRecordActivity(ctx.business.id, {
        category: "products",
        action: "product_added",
        actor: actorFromAccess(ctx),
        productId: product.id,
        productName: product.name,
        location: audit.location,
        quantityChange: audit.quantityAdded,
        previousValue: audit.previousLocationQty,
        newValue: audit.newLocationQty,
        previousTotal: audit.previousTotal,
        newTotal: audit.newTotal,
        summary: `Added product ${product.name}`,
        detail: `Stock +${audit.quantityAdded} at ${audit.location}; purchase price ${audit.purchasePrice}; low-stock threshold ${audit.restockThreshold}`,
      });
      await persistDb();
      return NextResponse.json({ product, business: await buildBusinessState(ctx.business.id), role: ctx.role });
    }

    if (action === "addStaff") {
      if (!canManagePeople(ctx.role)) return forbidden();
      const staff = await addStaff(ctx.business.id, {
        name: String(body.name || ""),
        phone: String(body.phone || ""),
        permission: (body.permission as Permission) || "view",
      });
      await safeRecordActivity(ctx.business.id, {
        category: "staff",
        action: "staff_added",
        actor: actorFromAccess(ctx),
        summary: `Added staff ${staff.name}`,
        detail: `Permission: ${staff.permission === "add" ? "can add stock" : "view only"}; WhatsApp ${staff.phone}`,
      });
      await persistDb();
      return NextResponse.json({ staff, business: await buildBusinessState(ctx.business.id), role: ctx.role });
    }

    if (action === "addOwner") {
      if (!canManageOwners(ctx.role)) return forbidden("Only equal owners can add other owners");
      const owner = await addOwner(ctx.business.id, {
        name: String(body.name || ""),
        phone: String(body.phone || ""),
        access: (body.access as OwnerAccess) === "co" ? "co" : "equal",
      });
      await safeRecordActivity(ctx.business.id, {
        category: "staff",
        action: "owner_added",
        actor: actorFromAccess(ctx),
        summary: `Added owner ${owner.name}`,
        detail: `Access: ${owner.access === "co" ? "co-owner" : "equal owner"}; WhatsApp ${owner.phone}`,
      });
      await persistDb();
      return NextResponse.json({ owner, business: await buildBusinessState(ctx.business.id), role: ctx.role });
    }

    if (action === "removeOwner") {
      if (!canManageOwners(ctx.role)) return forbidden("Only equal owners can remove owners");
      const ownerId = String(body.ownerId || "");
      const existing = (await getOwners(ctx.business.id)).find((o) => o.id === ownerId);
      await removeOwner(ctx.business.id, ownerId);
      if (existing) {
        await safeRecordActivity(ctx.business.id, {
          category: "staff",
          action: "owner_removed",
          actor: actorFromAccess(ctx),
          summary: `Removed owner ${existing.name}`,
          detail: `WhatsApp ${existing.phone}`,
        });
      }
      await persistDb();
      return NextResponse.json({ business: await buildBusinessState(ctx.business.id), role: ctx.role });
    }

    if (action === "recordSale") {
      if (!canAccessPrices(ctx.role)) return forbidden();
      const { product, alert, audit } = await recordSale(ctx.business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
      });
      await safeRecordActivity(ctx.business.id, {
        category: "stock",
        action: "stock_deducted",
        actor: actorFromAccess(ctx),
        productId: audit.productId,
        productName: audit.productName,
        location: audit.location,
        quantityChange: -audit.quantity,
        previousValue: audit.previousLocationQty,
        newValue: audit.newLocationQty,
        previousTotal: audit.previousTotal,
        newTotal: audit.newTotal,
        summary: `Deducted ${audit.quantity} ${audit.productName}`,
        detail: `${audit.location}: ${audit.previousLocationQty} → ${audit.newLocationQty}; total ${audit.previousTotal} → ${audit.newTotal}`,
      });
      let whatsappError: string | null = null;
      if (alert) {
        const ownerPhones = await getOwnerPhones(ctx.business.id);
        for (const to of ownerPhones) {
          try {
            const sent = await sendWhatsApp(to, `${alert.title}\n${alert.body}`);
            if (sent.skipped) {
              whatsappError = "Sale saved. WhatsApp low-stock alert was not sent — Twilio is not configured.";
            }
          } catch (err) {
            whatsappError =
              err instanceof Error ? err.message : "Sale saved, but WhatsApp low-stock alert failed to send.";
          }
        }
      }
      await persistDb();
      return NextResponse.json({
        product,
        alert,
        business: await buildBusinessState(ctx.business.id),
        role: ctx.role,
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "recordPurchasePrice") {
      if (!canAccessPrices(ctx.role)) return forbidden();
      const { product, alert, audit } = await recordPurchasePrice(
        ctx.business.id,
        String(body.productId || ""),
        Number(body.price),
      );
      await safeRecordActivity(ctx.business.id, {
        category: "prices",
        action: "purchase_price_changed",
        actor: actorFromAccess(ctx),
        productId: audit.productId,
        productName: audit.productName,
        previousValue: audit.previousPrice,
        newValue: audit.newPrice,
        summary: `Changed purchase price of ${audit.productName}`,
        detail: `${audit.previousPrice} → ${audit.newPrice} (per piece)`,
      });
      let whatsappError: string | null = null;
      if (alert) {
        const ownerPhones = await getOwnerPhones(ctx.business.id);
        for (const to of ownerPhones) {
          try {
            const sent = await sendWhatsApp(to, `${alert.title}\n${alert.body}`);
            if (sent.skipped) {
              whatsappError = "Price saved. WhatsApp alert was not sent — Twilio is not configured.";
            }
          } catch (err) {
            whatsappError =
              err instanceof Error ? err.message : "Price saved, but WhatsApp alert failed to send.";
          }
        }
      }
      await persistDb();
      return NextResponse.json({
        product,
        alert,
        business: await buildBusinessState(ctx.business.id),
        role: ctx.role,
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "backup") {
      if (!canSendReports(ctx.role)) return forbidden();
      const result = await runBackup(ctx.business.id);
      await persistDb();
      return NextResponse.json({ backup: result, business: await buildBusinessState(ctx.business.id), role: ctx.role });
    }

    if (action === "sendDailyReport") {
      if (!canSendReports(ctx.role)) return forbidden();
      const state = (await buildBusinessState(ctx.business.id))!;
      const total = state.products.reduce((sum, p) => sum + totalQty(p) * p.purchasePrice, 0);
      const low = state.products.filter((p) => totalQty(p) <= p.restockThreshold);
      const move = await biggestRecentMove(
        ctx.business.id,
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

      // Owner numbers only — never staff
      const ownerPhones = await getOwnerPhones(ctx.business.id);
      if (ownerPhones.length === 0) {
        return NextResponse.json({ error: "No owner WhatsApp numbers on this account" }, { status: 400 });
      }
      const preview = lines.join("\n");
      const results = [];
      for (const to of ownerPhones) {
        results.push(await sendWhatsApp(to, preview));
      }
      return NextResponse.json({
        sent: results[0],
        sentTo: ownerPhones,
        preview,
        twilioConfigured: twilioConfigured(),
        role: ctx.role,
      });
    }

    if (action === "sendMonthlyChart" || action === "sendWeeklyChart") {
      // sendWeeklyChart kept as alias for older clients; chart is monthly
      if (!canSendReports(ctx.role)) return forbidden();
      const chartState = await buildBusinessState(ctx.business.id);
      const productId = String(body.productId || "") || chartState?.products[0]?.id || "";
      if (!productId) return NextResponse.json({ error: "No product for chart" }, { status: 400 });
      const relative = await writeMonthlyPriceChart(ctx.business.id, productId, baseUrl(request));
      if (!relative) return NextResponse.json({ error: "No price history" }, { status: 400 });
      const ownerPhones = await getOwnerPhones(ctx.business.id);
      if (ownerPhones.length === 0) {
        return NextResponse.json({ error: "No owner WhatsApp numbers on this account" }, { status: 400 });
      }
      const media = relative.startsWith("http") ? relative : `${baseUrl(request)}${relative}`;
      const results = [];
      for (const to of ownerPhones) {
        results.push(await sendWhatsApp(to, "Monthly price comparison", media));
      }
      return NextResponse.json({
        sent: results[0],
        sentTo: ownerPhones,
        media,
        twilioConfigured: twilioConfigured(),
        role: ctx.role,
      });
    }

    if (action === "resetAccount") {
      if (!canResetBusiness(ctx.role)) return forbidden("Only equal owners can delete the business");
      return NextResponse.json({ error: "Use Settings reset" }, { status: 400 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
