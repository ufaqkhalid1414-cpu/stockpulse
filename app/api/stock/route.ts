import {
  canAddProduct,
  canAddStock,
  canAccessPrices,
  canArchiveProduct,
  canCorrectStock,
  canEditProduct,
  canManageOwners,
  canManagePeople,
  canMoveStock,
  canRecordSale,
  canResetBusiness,
  canSendReports,
  requireAccess,
  requireOwnerAccess,
} from "@/lib/access";
import { parseStaffPermission, permissionActivityLabel } from "@/lib/staff-permission";
import { ensureDbReady, persistDb } from "@/lib/db";
import { jsonNoStore } from "@/lib/api-response";
import { sanitizeBusinessState } from "@/lib/permissions";
import { actorFromAccess, recordActivity, type ActivityInput } from "@/lib/db/activity";
import { revokeSessionsForPhone } from "@/lib/session";
import { shouldAlertOwnersForRecount } from "@/lib/alert-throttle";
import { parseRequiredPurchasePrice } from "@/lib/price-math";
import { displayQty } from "@/lib/stock-math";
import {
  addOwner,
  addProduct,
  addStaff,
  addStock,
  addStockPlace,
  addWarehousePlace,
  archiveProduct,
  buildBusinessState,
  correctCount,
  editProduct,
  getOwnerPhones,
  getOwners,
  getPlaces,
  getStaff,
  locationLabel,
  moveStock,
  recordPurchasePrice,
  recordSale,
  removeOwner,
  removeStaff,
  removeStockPlace,
  removeWarehousePlace,
  renameStockPlace,
  renameWarehousePlace,
  restoreProduct,
  runBackup,
  setPriceCompareUnit,
  updateBusiness,
  updateStaffPermission,
} from "@/lib/db/queries";
import { sendWhatsApp, twilioConfigured } from "@/lib/twilio";
import { biggestRecentMove, writeMonthlyPriceChart } from "@/lib/charts";
import { totalQty } from "@/lib/metrics";
import type { Lang } from "@/lib/i18n";
import type { AccessRole, Location, OwnerAccess, StockPlaceKind } from "@/lib/types";
import type { AccessContext } from "@/lib/access";

export const runtime = "nodejs";

async function safeRecordActivity(businessId: string, input: ActivityInput) {
  try {
    await recordActivity(businessId, input);
  } catch (err) {
    console.error("[activity] failed to write history after successful change", err);
  }
}

/** Business state as seen by the caller's own role — never return the full state to staff. */
async function stateFor(businessId: string, role: AccessRole) {
  const state = await buildBusinessState(businessId);
  return state ? sanitizeBusinessState(role, state) : null;
}

function baseUrl(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function forbidden(message = "You do not have permission for this action") {
  return jsonNoStore({ error: message }, { status: 403 });
}

/**
 * Prompt 16 Part A: when a sale/move first puts a product+location into
 * "Needs recount", send one owner WhatsApp alert. Silence until Correct count
 * re-arms the flag.
 */
async function maybeSendRecountAlert(
  ctx: AccessContext,
  input: {
    productId: string;
    productName: string;
    location: Location;
    quantity: number;
    appHad: number;
  },
) {
  const shouldSend = await shouldAlertOwnersForRecount(ctx.business.id, input.productId, input.location).catch(
    () => false,
  );
  if (!shouldSend) return;
  const actor = actorFromAccess(ctx);
  const places = await getPlaces(ctx.business.id).catch(() => undefined);
  const place = locationLabel(input.location, places);
  const body = [
    `${actor.name} recorded ${input.quantity} of ${input.productName} in ${place}.`,
    `The app had ${displayQty(input.appHad)} (internal ${input.appHad}).`,
    "Please count and correct.",
  ].join("\n");
  const { sendOwnerAlert } = await import("@/lib/owner-alerts");
  await sendOwnerAlert({
    businessId: ctx.business.id,
    kind: "recount_alert",
    eventKey: `recount_${input.productId}_${input.location}_${actor.phone || "x"}`,
    title: "Needs recount",
    body,
  }).catch(() => undefined);
}

export async function GET() {
  await ensureDbReady();
  const ctx = await requireAccess();
  if (!ctx) return jsonNoStore({ error: "Please log in with WhatsApp first" }, { status: 401 });
  return jsonNoStore({
    business: await stateFor(ctx.business.id, ctx.role),
    role: ctx.role,
  });
}

export async function PATCH(request: Request) {
  await ensureDbReady();
  const ctx = await requireOwnerAccess("Settings");
  if (!ctx) return jsonNoStore({ error: "Please log in as an owner" }, { status: 403 });
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
  return jsonNoStore({ business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
}

export async function POST(request: Request) {
  await ensureDbReady();
  const ctx = await requireAccess();
  if (!ctx) return jsonNoStore({ error: "Please log in with WhatsApp first" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action || "");

  try {
    if (action === "addProduct") {
      if (!canAddProduct(ctx.role)) return forbidden("View-only staff cannot add products");
      const purchasePrice = parseRequiredPurchasePrice(body.purchasePrice);
      if (purchasePrice === null) {
        return jsonNoStore({ error: "Enter a price above zero." }, { status: 400 });
      }
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
        purchasePrice,
        photo: body.photo ? String(body.photo) : undefined,
        restockThreshold: parsedThreshold,
        piecesPerCarton: parsedPpc,
      });
      // Activity can finish after the response — don't block the success popup.
      void safeRecordActivity(ctx.business.id, {
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
      void persistDb();
      return jsonNoStore({ product, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "addStaff") {
      if (!canManagePeople(ctx.role)) return forbidden();
      const staff = await addStaff(ctx.business.id, {
        name: String(body.name || ""),
        phone: String(body.phone || ""),
        permission: parseStaffPermission(body.permission),
      });
      await safeRecordActivity(ctx.business.id, {
        category: "staff",
        action: "staff_added",
        actor: actorFromAccess(ctx),
        summary: `Added staff ${staff.name}`,
        detail: `Permission: ${permissionActivityLabel(staff.permission)}; WhatsApp ${staff.phone}`,
      });
      await persistDb();
      return jsonNoStore({ staff, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "removeStaff") {
      if (!canManagePeople(ctx.role)) return forbidden();
      const staffId = String(body.staffId || "");
      const existing = (await getStaff(ctx.business.id)).find((s) => s.id === staffId);
      if (!existing) return jsonNoStore({ error: "Staff member not found" }, { status: 404 });
      await removeStaff(ctx.business.id, staffId);
      // Removing staff must kill their active sessions immediately — they should not
      // keep using the app on an already-open device after being removed.
      await revokeSessionsForPhone(existing.phone).catch(() => undefined);
      await safeRecordActivity(ctx.business.id, {
        category: "staff",
        action: "staff_removed",
        actor: actorFromAccess(ctx),
        summary: `Removed staff ${existing.name}`,
        detail: `WhatsApp ${existing.phone}`,
      });
      await persistDb();
      return jsonNoStore({ business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "updateStaffPermission") {
      if (!canManagePeople(ctx.role)) return forbidden();
      const staffId = String(body.staffId || "");
      const permission = parseStaffPermission(body.permission);
      const existing = (await getStaff(ctx.business.id)).find((s) => s.id === staffId);
      if (!existing) return jsonNoStore({ error: "Staff member not found" }, { status: 404 });
      await updateStaffPermission(ctx.business.id, staffId, permission);
      // Permission changes take effect immediately — force re-auth so a demoted
      // staff member can't keep using old powers on an already-open device.
      await revokeSessionsForPhone(existing.phone).catch(() => undefined);
      await safeRecordActivity(ctx.business.id, {
        category: "staff",
        action: "staff_permission_changed",
        actor: actorFromAccess(ctx),
        summary: `Changed permission for ${existing.name}`,
        detail: `${permissionActivityLabel(existing.permission)} → ${permissionActivityLabel(permission)}`,
      });
      await persistDb();
      return jsonNoStore({ business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
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
      return jsonNoStore({ owner, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "removeOwner") {
      if (!canManageOwners(ctx.role)) return forbidden("Only equal owners can remove owners");
      const ownerId = String(body.ownerId || "");
      const existing = (await getOwners(ctx.business.id)).find((o) => o.id === ownerId);
      await removeOwner(ctx.business.id, ownerId);
      if (existing) {
        // Removed owners lose access everywhere immediately too.
        await revokeSessionsForPhone(existing.phone).catch(() => undefined);
        await safeRecordActivity(ctx.business.id, {
          category: "staff",
          action: "owner_removed",
          actor: actorFromAccess(ctx),
          summary: `Removed owner ${existing.name}`,
          detail: `WhatsApp ${existing.phone}`,
        });
      }
      await persistDb();
      return jsonNoStore({ business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "addStock") {
      if (!canAddStock(ctx.role)) return forbidden();
      const idempotencyKey = String(body.idempotencyKey || "");
      if (!idempotencyKey) return jsonNoStore({ error: "idempotencyKey is required" }, { status: 400 });
      const outcome = await addStock(ctx.business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
        idempotencyKey,
      });
      const { product, replayed, audit } = outcome;
      if (!replayed) {
        await safeRecordActivity(ctx.business.id, {
          category: "stock",
          action: "stock_added",
          actor: actorFromAccess(ctx),
          productId: audit.productId,
          productName: audit.productName,
          location: audit.location,
          quantityChange: audit.quantityAdded,
          previousValue: audit.previousLocationQty,
          newValue: audit.newLocationQty,
          previousTotal: audit.previousTotal,
          newTotal: audit.newTotal,
          summary: `Added ${audit.quantityAdded} ${audit.productName}`,
          detail: `${audit.location}: ${audit.previousLocationQty} → ${audit.newLocationQty}; total ${audit.previousTotal} → ${audit.newTotal}`,
        });
      }
      await persistDb();
      return jsonNoStore({ product, replayed, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "moveStock") {
      if (!canMoveStock(ctx.role)) return forbidden();
      const idempotencyKey = String(body.idempotencyKey || "");
      if (!idempotencyKey) return jsonNoStore({ error: "idempotencyKey is required" }, { status: 400 });
      const outcome = await moveStock(ctx.business.id, {
        productId: String(body.productId || ""),
        from: body.from as Location,
        to: body.to as Location,
        quantity: Number(body.quantity),
        idempotencyKey,
      });
      const { product, replayed, alert, audit } = outcome;
      if (!replayed) {
        await safeRecordActivity(ctx.business.id, {
          category: "stock",
          action: "stock_moved",
          actor: actorFromAccess(ctx),
          productId: audit.productId,
          productName: audit.productName,
          fromLocation: audit.from,
          toLocation: audit.to,
          quantityChange: audit.quantity,
          previousValue: audit.previousFromQty,
          newValue: audit.newFromQty,
          summary: audit.neededRecount
            ? `Moved ${audit.quantity} ${audit.productName} (needed recount)`
            : `Moved ${audit.quantity} ${audit.productName}`,
          detail: `${audit.from} ${audit.previousFromQty} → ${audit.newFromQty}; ${audit.to} ${audit.previousToQty} → ${audit.newToQty}${
            audit.neededRecount ? "; needed recount" : ""
          }`,
        });
        if (audit.neededRecount) {
          await maybeSendRecountAlert(ctx, {
            productId: audit.productId,
            productName: audit.productName,
            location: audit.from,
            quantity: audit.quantity,
            appHad: audit.previousFromQty,
          });
        }
      }
      let whatsappError: string | null = null;
      if (!replayed && alert) {
        try {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts");
          const result = await sendOwnerAlert({
            businessId: ctx.business.id,
            kind: "low_stock_alert",
            eventKey: `low_stock_${audit.productId}_${audit.from}_${audit.newFromQty}`,
            title: alert.title,
            body: alert.body,
          });
          if (result.sent === 0 && !twilioConfigured()) {
            whatsappError = "Move saved. WhatsApp low-stock alert was not sent — Twilio is not configured.";
          }
        } catch (err) {
          whatsappError =
            err instanceof Error ? err.message : "Move saved, but WhatsApp low-stock alert failed to send.";
        }
      }
      await persistDb();
      return jsonNoStore({
        product,
        alert,
        replayed,
        neededRecount: audit.neededRecount,
        appHad: audit.previousFromQty,
        quantity: audit.quantity,
        note: audit.neededRecount
          ? `Saved. The app had only ${displayQty(audit.previousFromQty)}, so a recount is needed.`
          : null,
        business: await stateFor(ctx.business.id, ctx.role),
        role: ctx.role,
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "correctCount") {
      if (!canCorrectStock(ctx.role)) return forbidden("Only owners can correct a stock count");
      const idempotencyKey = String(body.idempotencyKey || "");
      if (!idempotencyKey) return jsonNoStore({ error: "idempotencyKey is required" }, { status: 400 });
      const { product, replayed, alert, audit } = await correctCount(ctx.business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        newCount: Number(body.newCount),
        idempotencyKey,
      });
      if (!replayed) {
        await safeRecordActivity(ctx.business.id, {
          category: "stock",
          action: "stock_corrected",
          actor: actorFromAccess(ctx),
          productId: audit.productId,
          productName: audit.productName,
          location: audit.location,
          previousValue: audit.previousLocationQty,
          newValue: audit.newLocationQty,
          previousTotal: audit.previousTotal,
          newTotal: audit.newTotal,
          summary: `Corrected count for ${audit.productName}`,
          detail: `${audit.location}: ${audit.previousLocationQty} → ${audit.newLocationQty}; total ${audit.previousTotal} → ${audit.newTotal}`,
        });
      }
      let whatsappError: string | null = null;
      if (!replayed && alert) {
        try {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts");
          const result = await sendOwnerAlert({
            businessId: ctx.business.id,
            kind: "low_stock_alert",
            eventKey: `low_stock_${audit.productId}_${audit.location}_${audit.newLocationQty}`,
            title: alert.title,
            body: alert.body,
          });
          if (result.sent === 0 && !twilioConfigured()) {
            whatsappError = "Correction saved. WhatsApp low-stock alert was not sent — Twilio is not configured.";
          }
        } catch (err) {
          whatsappError =
            err instanceof Error ? err.message : "Correction saved, but WhatsApp low-stock alert failed to send.";
        }
      }
      await persistDb();
      return jsonNoStore({
        product,
        alert,
        replayed,
        business: await stateFor(ctx.business.id, ctx.role),
        role: ctx.role,
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "editProduct") {
      if (!canEditProduct(ctx.role)) return forbidden("Only owners can edit product details");
      const rawThreshold = body.restockThreshold;
      const parsedThreshold =
        rawThreshold === undefined || rawThreshold === null || String(rawThreshold).trim() === ""
          ? undefined
          : Number(rawThreshold);
      const rawPpc = body.piecesPerCarton;
      const parsedPpc =
        rawPpc === undefined ? undefined : rawPpc === null || String(rawPpc).trim() === "" ? null : Number(rawPpc);
      const { product, before, after } = await editProduct(ctx.business.id, {
        productId: String(body.productId || ""),
        name: typeof body.name === "string" ? body.name : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        variant: typeof body.variant === "string" ? body.variant : undefined,
        photo: body.photo === undefined ? undefined : body.photo ? String(body.photo) : null,
        restockThreshold: parsedThreshold,
        piecesPerCarton: parsedPpc,
      });
      const changes: string[] = [];
      if (before.name !== after.name) changes.push(`Name: "${before.name}" → "${after.name}"`);
      if (before.category !== after.category) changes.push(`Category: "${before.category}" → "${after.category}"`);
      if (before.variant !== after.variant) changes.push(`Variant: "${before.variant}" → "${after.variant}"`);
      if (before.restockThreshold !== after.restockThreshold) {
        changes.push(`Low-stock threshold: ${before.restockThreshold} → ${after.restockThreshold}`);
      }
      if (before.piecesPerCarton !== after.piecesPerCarton) {
        changes.push(`Pieces per carton: ${before.piecesPerCarton ?? "—"} → ${after.piecesPerCarton ?? "—"}`);
      }
      if (before.photo !== after.photo) changes.push("Photo changed");
      await safeRecordActivity(ctx.business.id, {
        category: "products",
        action: "product_edited",
        actor: actorFromAccess(ctx),
        productId: product.id,
        productName: product.name,
        summary: `Edited ${product.name}`,
        detail: changes.length ? changes.join("; ") : "No fields changed",
      });
      await persistDb();
      return jsonNoStore({ product, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "setPriceCompareUnit") {
      if (!canEditProduct(ctx.role)) return forbidden("Only owners can change price compare unit");
      const rawUnit = String(body.unit ?? body.priceCompareUnit ?? "").toLowerCase();
      const unit = rawUnit === "carton" ? "carton" : "piece";
      const product = await setPriceCompareUnit(ctx.business.id, String(body.productId || ""), unit);
      await persistDb();
      return jsonNoStore({ product, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "archiveProduct") {
      if (!canArchiveProduct(ctx.role)) return forbidden("Only owners can archive a product");
      const product = await archiveProduct(ctx.business.id, String(body.productId || ""));
      await safeRecordActivity(ctx.business.id, {
        category: "products",
        action: "product_archived",
        actor: actorFromAccess(ctx),
        productId: product.id,
        productName: product.name,
        summary: `Archived ${product.name}`,
        detail: "Hidden from lists, alerts, and reports.",
      });
      await persistDb();
      return jsonNoStore({ product, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "restoreProduct") {
      if (!canArchiveProduct(ctx.role)) return forbidden("Only owners can restore a product");
      const product = await restoreProduct(ctx.business.id, String(body.productId || ""));
      await safeRecordActivity(ctx.business.id, {
        category: "products",
        action: "product_restored",
        actor: actorFromAccess(ctx),
        productId: product.id,
        productName: product.name,
        summary: `Restored ${product.name}`,
        detail: "Visible again in lists, alerts, and reports.",
      });
      await persistDb();
      return jsonNoStore({ product, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "recordSale") {
      if (!canRecordSale(ctx.role)) return forbidden();
      const idempotencyKey = String(body.idempotencyKey || "");
      if (!idempotencyKey) return jsonNoStore({ error: "idempotencyKey is required" }, { status: 400 });
      const outcome = await recordSale(ctx.business.id, {
        productId: String(body.productId || ""),
        location: body.location as Location,
        quantity: Number(body.quantity),
        idempotencyKey,
      });
      const { product, alert, replayed, audit } = outcome;
      if (!replayed) {
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
          summary: audit.neededRecount
            ? `Deducted ${audit.quantity} ${audit.productName} (needed recount)`
            : `Deducted ${audit.quantity} ${audit.productName}`,
          detail: `${audit.location}: ${audit.previousLocationQty} → ${audit.newLocationQty}; total ${audit.previousTotal} → ${audit.newTotal}${
            audit.neededRecount ? "; needed recount" : ""
          }`,
        });
        if (audit.neededRecount) {
          await maybeSendRecountAlert(ctx, {
            productId: audit.productId,
            productName: audit.productName,
            location: audit.location,
            quantity: audit.quantity,
            appHad: audit.previousLocationQty,
          });
        }
      }
      let whatsappError: string | null = null;
      if (!replayed && alert) {
        try {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts");
          const result = await sendOwnerAlert({
            businessId: ctx.business.id,
            kind: "low_stock_alert",
            eventKey: `low_stock_${audit.productId}_${audit.location}_${audit.newLocationQty}`,
            title: alert.title,
            body: alert.body,
          });
          if (result.sent === 0 && !twilioConfigured()) {
            whatsappError = "Sale saved. WhatsApp low-stock alert was not sent — Twilio is not configured.";
          }
        } catch (err) {
          whatsappError =
            err instanceof Error ? err.message : "Sale saved, but WhatsApp low-stock alert failed to send.";
        }
      }
      await persistDb();
      return jsonNoStore({
        product,
        alert,
        replayed,
        neededRecount: audit.neededRecount,
        appHad: audit.previousLocationQty,
        quantity: audit.quantity,
        note: audit.neededRecount
          ? `Saved. The app had only ${displayQty(audit.previousLocationQty)}, so a recount is needed.`
          : null,
        business: await stateFor(ctx.business.id, ctx.role),
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
        try {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts");
          const result = await sendOwnerAlert({
            businessId: ctx.business.id,
            kind: "price_alert",
            eventKey: `price_${audit.productId}_${audit.newPrice}`,
            title: alert.title,
            body: alert.body,
          });
          if (result.sent === 0 && !twilioConfigured()) {
            whatsappError = "Price saved. WhatsApp alert was not sent — Twilio is not configured.";
          }
        } catch (err) {
          whatsappError =
            err instanceof Error ? err.message : "Price saved, but WhatsApp alert failed to send.";
        }
      }
      await persistDb();
      return jsonNoStore({
        product,
        alert,
        business: await stateFor(ctx.business.id, ctx.role),
        role: ctx.role,
        twilioConfigured: twilioConfigured(),
        whatsappError,
      });
    }

    if (action === "backup") {
      if (!canSendReports(ctx.role)) return forbidden();
      const result = await runBackup(ctx.business.id);
      await persistDb();
      return jsonNoStore({ backup: result, business: await stateFor(ctx.business.id, ctx.role), role: ctx.role });
    }

    if (action === "sendDailyReport") {
      if (!canSendReports(ctx.role)) return forbidden();
      const { normalizeReportChannel, emailDeliveryConfigured, resolveReportEmailRecipient } =
        await import("@/lib/report-delivery");
      const channel = normalizeReportChannel(body.channel);
      if (!channel) {
        return jsonNoStore(
          { error: "Choose WhatsApp or Email to send today's report." },
          { status: 400 },
        );
      }
      const state = (await buildBusinessState(ctx.business.id))!;
      const { buildDailyReportMessage } = await import("@/lib/daily-report");
      const preview = buildDailyReportMessage({
        businessName: state.businessName,
        language: state.language,
        products: state.products,
      });

      if (channel === "email") {
        const toEmail = resolveReportEmailRecipient(ctx.session.email);
        if (!toEmail) {
          return jsonNoStore(
            {
              error:
                "No email on your login. Sign in with email (or link an email) to receive today's report by email.",
            },
            { status: 400 },
          );
        }
        if (!emailDeliveryConfigured()) {
          return jsonNoStore(
            {
              error:
                "Email delivery is not configured yet. Add RESEND_API_KEY and REPORT_EMAIL_FROM on the server.",
            },
            { status: 503 },
          );
        }
        const { sendPlainEmail } = await import("@/lib/email");
        const mailed = await sendPlainEmail({
          to: toEmail,
          subject: `StockPulse — today's report (${state.businessName})`,
          text: preview,
        });
        if (!mailed.ok) {
          return jsonNoStore(
            {
              error: mailed.error,
              sent: { ok: false, skipped: mailed.skipped === true, failReason: mailed.error },
              preview,
              channel: "email",
              role: ctx.role,
            },
            { status: mailed.skipped ? 503 : 502 },
          );
        }
        return jsonNoStore({
          sent: { ok: true, id: mailed.id },
          sentTo: [toEmail],
          preview,
          channel: "email",
          role: ctx.role,
          testLabel: "Send me today's report now (test)",
        });
      }

      // WhatsApp — existing manual test send (only the requesting owner)
      const { recordAndSendWhatsApp } = await import("@/lib/outbound");
      const { normalizePhone } = await import("@/lib/phone");
      const owners = await getOwners(ctx.business.id);
      const mine = owners.find((o) => normalizePhone(o.phone) === normalizePhone(ctx.session.phone));
      const to = mine ? normalizePhone(mine.phone) : normalizePhone(ctx.session.phone);
      if (!to) {
        return jsonNoStore({ error: "No owner WhatsApp number for your account" }, { status: 400 });
      }
      const sent = await recordAndSendWhatsApp({
        businessId: ctx.business.id,
        toPhone: to,
        kind: "daily_report_test",
        body: preview,
      });
      return jsonNoStore({
        sent,
        sentTo: [to],
        preview,
        channel: "whatsapp",
        twilioConfigured: twilioConfigured(),
        role: ctx.role,
        testLabel: "Send me today's report now (test)",
      });
    }

    if (action === "updateNotificationPrefs") {
      if (!canSendReports(ctx.role)) return forbidden();
      const owners = await getOwners(ctx.business.id);
      const { normalizePhone } = await import("@/lib/phone");
      const mine = owners.find((o) => normalizePhone(o.phone) === normalizePhone(ctx.session.phone));
      if (!mine) return forbidden("Only owners can change notification settings");
      const { updateOwnerNotificationPrefs } = await import("@/lib/db/queries");
      const prefs = body.prefs && typeof body.prefs === "object" ? (body.prefs as Record<string, unknown>) : {};
      const before = mine.notificationPrefs;
      const updated = await updateOwnerNotificationPrefs(ctx.business.id, mine.id, prefs);
      const changed: string[] = [];
      const next = updated.notificationPrefs;
      if (before && next) {
        if (before.dailyReport !== next.dailyReport) changed.push(next.dailyReport ? "Daily report on" : "Daily report off");
        if (before.dailyReportTime !== next.dailyReportTime) changed.push(`Daily report time ${next.dailyReportTime}`);
        if (before.priceAlerts !== next.priceAlerts) changed.push(next.priceAlerts ? "Price alerts on" : "Price alerts off");
        if (before.lowStockAlerts !== next.lowStockAlerts) changed.push(next.lowStockAlerts ? "Low-stock alerts on" : "Low-stock alerts off");
        if (before.recountAlerts !== next.recountAlerts) changed.push(next.recountAlerts ? "Recount alerts on" : "Recount alerts off");
        if (before.monthlyChart !== next.monthlyChart) changed.push(next.monthlyChart ? "Monthly price chart on" : "Monthly price chart off");
        if (before.pauseAll !== next.pauseAll) changed.push(next.pauseAll ? "Paused all" : "Resumed all");
      }
      await safeRecordActivity(ctx.business.id, {
        category: "settings",
        action: "settings_changed",
        actor: actorFromAccess(ctx),
        summary: changed.length ? `${mine.name} turned: ${changed.join("; ")}` : `${mine.name} updated notification settings`,
        detail: JSON.stringify(updated.notificationPrefs || {}),
      });
      return jsonNoStore({
        prefs: updated.notificationPrefs,
        business: await stateFor(ctx.business.id, ctx.role),
        role: ctx.role,
      });
    }

    if (action === "requestChangeMyNumber") {
      if (!canSendReports(ctx.role)) return forbidden();
      const { normalizePhone, isValidPhone } = await import("@/lib/phone");
      const newPhone = normalizePhone(String(body.newPhone || ""));
      if (!isValidPhone(newPhone)) {
        return jsonNoStore({ error: "Enter a WhatsApp number with country code" }, { status: 400 });
      }
      const owners = await getOwners(ctx.business.id);
      const mine = owners.find((o) => normalizePhone(o.phone) === normalizePhone(ctx.session.phone));
      if (!mine) return forbidden("Only owners can change their own number here");
      if (normalizePhone(mine.phone) === newPhone) {
        return jsonNoStore({ error: "That is already your number" }, { status: 400 });
      }
      const { createOtp, otpDevModeEnabled } = await import("@/lib/session");
      let code: string;
      try {
        ({ code } = await createOtp(newPhone));
      } catch (err) {
        return jsonNoStore(
          { error: err instanceof Error ? err.message : "Could not send code" },
          { status: 429 },
        );
      }
      const message = `StockPulse: confirm your new number with code ${code}. Expires in 10 minutes.`;
      if (twilioConfigured()) {
        try {
          await sendWhatsApp(newPhone, message);
        } catch (err) {
          return jsonNoStore(
            { error: err instanceof Error ? err.message : "Could not send code to the new number" },
            { status: 502 },
          );
        }
        await persistDb();
        return jsonNoStore({ ok: true, sent: true, newPhone });
      }
      if (otpDevModeEnabled()) {
        await persistDb();
        return jsonNoStore({ ok: true, sent: false, newPhone, devCode: code });
      }
      return jsonNoStore({ error: "WhatsApp is not configured" }, { status: 503 });
    }

    if (action === "confirmChangeMyNumber") {
      if (!canSendReports(ctx.role)) return forbidden();
      const { normalizePhone, isValidPhone } = await import("@/lib/phone");
      const newPhone = normalizePhone(String(body.newPhone || ""));
      const code = String(body.code || "").trim();
      if (!isValidPhone(newPhone) || !/^\d{6}$/.test(code)) {
        return jsonNoStore({ error: "Enter the new number and the 6-digit code" }, { status: 400 });
      }
      const { verifyOtp } = await import("@/lib/session");
      if (!(await verifyOtp(newPhone, code))) {
        return jsonNoStore({ error: "That code is wrong or expired" }, { status: 401 });
      }
      const owners = await getOwners(ctx.business.id);
      const mine = owners.find((o) => normalizePhone(o.phone) === normalizePhone(ctx.session.phone));
      if (!mine) return forbidden("Only owners can change their own number here");
      const oldPhone = mine.phone;
      const { updateOwnerOwnPhone } = await import("@/lib/db/queries");
      try {
        await updateOwnerOwnPhone(ctx.business.id, mine.id, newPhone);
      } catch (err) {
        return jsonNoStore({ error: err instanceof Error ? err.message : "Could not change number" }, { status: 400 });
      }
      await revokeSessionsForPhone(oldPhone);
      await revokeSessionsForPhone(newPhone);
      await safeRecordActivity(ctx.business.id, {
        category: "settings",
        action: "settings_changed",
        actor: actorFromAccess(ctx),
        summary: `${mine.name} changed their WhatsApp number`,
        detail: `${oldPhone} → ${newPhone}`,
      });
      await persistDb();
      return jsonNoStore({
        ok: true,
        phoneChanged: true,
        sessionsEnded: true,
        business: await stateFor(ctx.business.id, ctx.role),
        role: ctx.role,
      });
    }

    if (action === "addPlace" || action === "addWarehouse" || action === "addShop" || action === "addOnlineStore") {
      if (!canSendReports(ctx.role)) return forbidden();
      const name = String(body.name || "").trim();
      const kind: StockPlaceKind =
        action === "addShop"
          ? "shop"
          : action === "addOnlineStore"
            ? "online"
            : action === "addWarehouse"
              ? "warehouse"
              : body.kind === "shop" || body.kind === "online" || body.kind === "warehouse"
                ? body.kind
                : "warehouse";
      try {
        const places =
          action === "addWarehouse"
            ? await addWarehousePlace(ctx.business.id, name)
            : await addStockPlace(ctx.business.id, kind, name);
        const label = kind === "shop" ? "shop" : kind === "online" ? "online store" : "warehouse";
        await safeRecordActivity(ctx.business.id, {
          category: "settings",
          action: "settings_changed",
          actor: actorFromAccess(ctx),
          summary: `Added ${label} “${name}”`,
          detail: null,
        });
        await persistDb();
        return jsonNoStore({
          places,
          business: await stateFor(ctx.business.id, ctx.role),
          role: ctx.role,
        });
      } catch (err) {
        return jsonNoStore({ error: err instanceof Error ? err.message : "Could not add place" }, { status: 400 });
      }
    }

    if (
      action === "renamePlace" ||
      action === "renameWarehouse" ||
      action === "renameShop" ||
      action === "renameOnlineStore"
    ) {
      if (!canSendReports(ctx.role)) return forbidden();
      const placeId = String(body.placeId || "");
      const name = String(body.name || "").trim();
      try {
        const places =
          action === "renameWarehouse"
            ? await renameWarehousePlace(ctx.business.id, placeId, name)
            : await renameStockPlace(ctx.business.id, placeId, name);
        await safeRecordActivity(ctx.business.id, {
          category: "settings",
          action: "settings_changed",
          actor: actorFromAccess(ctx),
          summary: `Renamed place to “${name}”`,
          detail: placeId,
        });
        await persistDb();
        return jsonNoStore({
          places,
          business: await stateFor(ctx.business.id, ctx.role),
          role: ctx.role,
        });
      } catch (err) {
        return jsonNoStore({ error: err instanceof Error ? err.message : "Could not rename place" }, { status: 400 });
      }
    }

    if (
      action === "removePlace" ||
      action === "removeWarehouse" ||
      action === "removeShop" ||
      action === "removeOnlineStore"
    ) {
      if (!canSendReports(ctx.role)) return forbidden();
      const placeId = String(body.placeId || "");
      try {
        const places =
          action === "removeWarehouse"
            ? await removeWarehousePlace(ctx.business.id, placeId)
            : await removeStockPlace(ctx.business.id, placeId);
        await safeRecordActivity(ctx.business.id, {
          category: "settings",
          action: "settings_changed",
          actor: actorFromAccess(ctx),
          summary: "Removed a stock place",
          detail: placeId,
        });
        await persistDb();
        return jsonNoStore({
          places,
          business: await stateFor(ctx.business.id, ctx.role),
          role: ctx.role,
        });
      } catch (err) {
        return jsonNoStore({ error: err instanceof Error ? err.message : "Could not remove place" }, { status: 400 });
      }
    }

    if (action === "sendMonthlyChart" || action === "sendWeeklyChart") {
      // sendWeeklyChart kept as alias for older clients; chart is monthly
      if (!canSendReports(ctx.role)) return forbidden();
      const chartState = await buildBusinessState(ctx.business.id);
      const productId = String(body.productId || "") || chartState?.products[0]?.id || "";
      if (!productId) return jsonNoStore({ error: "No product for chart" }, { status: 400 });
      const relative = await writeMonthlyPriceChart(ctx.business.id, productId, baseUrl(request));
      if (!relative) return jsonNoStore({ error: "No price history" }, { status: 400 });
      const ownerPhones = await getOwnerPhones(ctx.business.id);
      if (ownerPhones.length === 0) {
        return jsonNoStore({ error: "No owner WhatsApp numbers on this account" }, { status: 400 });
      }
      const media = relative.startsWith("http") ? relative : `${baseUrl(request)}${relative}`;
      const results = [];
      for (const to of ownerPhones) {
        results.push(await sendWhatsApp(to, "Monthly price comparison", media));
      }
      return jsonNoStore({
        sent: results[0],
        sentTo: ownerPhones,
        media,
        twilioConfigured: twilioConfigured(),
        role: ctx.role,
      });
    }

    if (action === "resetAccount") {
      if (!canResetBusiness(ctx.role)) return forbidden("Only equal owners can delete the business");
      return jsonNoStore({ error: "Use Settings reset" }, { status: 400 });
    }

    return jsonNoStore({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
