import { NextResponse } from "next/server";
import { canResetBusiness, homePathForRole, requireAccess } from "@/lib/access";
import { ensureDbReady, persistDb } from "@/lib/db";
import { buildBusinessState, createBusiness, deleteBusiness, findMembershipByPhone } from "@/lib/db/queries";
import {
  attachBusinessToSession,
  destroySession,
  getSession,
  requireSession,
} from "@/lib/session";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDbReady();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({
        authenticated: false,
        needsSetup: false,
        phone: null,
        role: null,
        homePath: "/",
        business: null,
      });
    }
    if (!session.businessId) {
      return NextResponse.json({
        authenticated: true,
        needsSetup: true,
        phone: session.phone,
        role: null,
        homePath: "/",
        business: null,
      });
    }
    const membership = await findMembershipByPhone(session.phone);
    if (!membership || membership.businessId !== session.businessId) {
      return NextResponse.json({
        authenticated: true,
        needsSetup: true,
        phone: session.phone,
        role: null,
        homePath: "/",
        business: null,
      });
    }
    const state = await buildBusinessState(session.businessId);
    if (!state) {
      return NextResponse.json({
        authenticated: true,
        needsSetup: true,
        phone: session.phone,
        role: null,
        homePath: "/",
        business: null,
      });
    }
    return NextResponse.json({
      authenticated: true,
      needsSetup: false,
      phone: session.phone,
      role: membership.role,
      homePath: homePathForRole(membership.role),
      business: state,
    });
  } catch (err) {
    console.error("[api/business GET]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Database unavailable",
        authenticated: false,
        business: null,
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbReady();
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Please log in with WhatsApp first" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: "create" | "sample" | "reset";
      name?: string;
      language?: Lang;
    };

    if (body.action === "reset") {
      const ctx = await requireAccess();
      if (!ctx || !canResetBusiness(ctx.role)) {
        return NextResponse.json(
          { error: "Only equal owners can delete the business account" },
          { status: 403 },
        );
      }
      await deleteBusiness(ctx.business.id);
      await destroySession();
      await persistDb();
      return NextResponse.json({ authenticated: false, business: null });
    }

    // Staff/owners already on a business cannot create another
    if (session.businessId) {
      const membership = await findMembershipByPhone(session.phone);
      if (membership) {
        return NextResponse.json({ error: "You already have an account on this login" }, { status: 409 });
      }
    }

    if (body.action !== "create" && body.action !== "sample") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const name = (body.name || "").trim() || "General Store";
    const created = await createBusiness({
      name,
      language: body.language ?? "en",
      ownerWhatsapp: session.phone,
      seedSample: body.action === "sample",
    });
    await attachBusinessToSession(created.id);
    await persistDb();
    return NextResponse.json({
      authenticated: true,
      needsSetup: false,
      phone: session.phone,
      role: "equal_owner",
      homePath: "/dashboard",
      business: await buildBusinessState(created.id),
    });
  } catch (err) {
    console.error("[api/business POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your business" },
      { status: 503 },
    );
  }
}
