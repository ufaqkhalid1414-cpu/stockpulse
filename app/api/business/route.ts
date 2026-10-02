import { NextResponse } from "next/server";
import { ensureDbReady, persistDb } from "@/lib/db";
import { buildBusinessState, createBusiness, deleteBusiness } from "@/lib/db/queries";
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
        business: null,
      });
    }
    if (!session.businessId) {
      return NextResponse.json({
        authenticated: true,
        needsSetup: true,
        phone: session.phone,
        business: null,
      });
    }
    const state = buildBusinessState(session.businessId);
    if (!state) {
      // Stale session business — keep phone auth, force setup
      return NextResponse.json({
        authenticated: true,
        needsSetup: true,
        phone: session.phone,
        business: null,
      });
    }
    return NextResponse.json({
      authenticated: true,
      needsSetup: false,
      phone: session.phone,
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
      if (session.businessId) deleteBusiness(session.businessId);
      await destroySession();
      await persistDb();
      return NextResponse.json({ authenticated: false, business: null });
    }

    // Creating a business requires verified phone; only when no business yet
    if (session.businessId) {
      const existing = buildBusinessState(session.businessId);
      if (existing) {
        return NextResponse.json({ error: "You already have a business on this login" }, { status: 409 });
      }
    }

    if (body.action !== "create" && body.action !== "sample") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const name = (body.name || "").trim() || "General Store";
    const created = createBusiness({
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
      business: buildBusinessState(created.id),
    });
  } catch (err) {
    console.error("[api/business POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your business" },
      { status: 503 },
    );
  }
}
