import { NextResponse } from "next/server";
import { requireOwnerAccess } from "@/lib/access";
import { ensureDbReady, persistDb } from "@/lib/db";
import {
  applyShopifyProductSync,
  buildBusinessState,
  clearShopifyConnection,
  getShopifyConnection,
  getShopifyConnectionPublic,
  markShopifySyncResult,
  saveShopifyConnection,
} from "@/lib/db/queries";
import { fetchShopifyCatalog, normalizeShopDomain, testShopifyConnection } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  await ensureDbReady();
  const ctx = await requireOwnerAccess();
  if (!ctx) return NextResponse.json({ error: "Please log in as an owner" }, { status: 403 });
  return NextResponse.json({
    shopify: await getShopifyConnectionPublic(ctx.business.id),
    business: await buildBusinessState(ctx.business.id),
  });
}

export async function POST(request: Request) {
  await ensureDbReady();
  const ctx = await requireOwnerAccess();
  if (!ctx) return NextResponse.json({ error: "Please log in as an owner" }, { status: 403 });

  const body = (await request.json()) as {
    action?: "connect" | "disconnect" | "sync";
    shopDomain?: string;
    accessToken?: string;
  };
  const action = body.action || "";

  try {
    if (action === "connect") {
      const shopDomain = normalizeShopDomain(String(body.shopDomain || ""));
      const accessToken = String(body.accessToken || "").trim();
      if (!accessToken || accessToken.length < 10) {
        return NextResponse.json({ error: "Paste your Shopify Admin API access token" }, { status: 400 });
      }
      await testShopifyConnection(shopDomain, accessToken);
      const shopify = await saveShopifyConnection(ctx.business.id, shopDomain, accessToken);
      await persistDb();
      return NextResponse.json({
        ok: true,
        shopify,
        business: await buildBusinessState(ctx.business.id),
      });
    }

    if (action === "disconnect") {
      await clearShopifyConnection(ctx.business.id);
      await persistDb();
      return NextResponse.json({
        ok: true,
        shopify: await getShopifyConnectionPublic(ctx.business.id),
        business: await buildBusinessState(ctx.business.id),
      });
    }

    if (action === "sync") {
      const conn = await getShopifyConnection(ctx.business.id);
      if (!conn) {
        return NextResponse.json(
          { error: "Connect a Shopify store first (domain + Admin API token)" },
          { status: 400 },
        );
      }
      try {
        const items = await fetchShopifyCatalog(conn.shop_domain, conn.access_token);
        const count = await applyShopifyProductSync(ctx.business.id, items);
        await markShopifySyncResult(ctx.business.id, { ok: true, count });
        await persistDb();
        return NextResponse.json({
          ok: true,
          count,
          shopify: await getShopifyConnectionPublic(ctx.business.id),
          business: await buildBusinessState(ctx.business.id),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Shopify sync failed";
        await markShopifySyncResult(ctx.business.id, { ok: false, count: 0, error: message });
        await persistDb();
        return NextResponse.json(
          {
            error: message,
            shopify: await getShopifyConnectionPublic(ctx.business.id),
            business: await buildBusinessState(ctx.business.id),
          },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopify request failed" },
      { status: 400 },
    );
  }
}
