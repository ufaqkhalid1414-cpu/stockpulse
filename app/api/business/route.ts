import { canResetBusiness, homePathForRole, requireAccess } from "@/lib/access";
import { ensureDbReady, persistDb } from "@/lib/db";
import { jsonNoStore } from "@/lib/api-response";
import { sanitizeBusinessState } from "@/lib/permissions";
import {
  buildBusinessState,
  createBusiness,
  deleteBusiness,
  findMembershipForSession,
} from "@/lib/db/queries";
import { getAuthAccountByEmail } from "@/lib/auth-accounts";
import { INVITE_ONLY_MESSAGE, publicSignupAllowed } from "@/lib/public-access";
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
    let session = await getSession();
    if (!session) {
      return jsonNoStore({
        authenticated: false,
        needsSetup: false,
        phone: null,
        email: null,
        role: null,
        homePath: "/",
        business: null,
      });
    }

    let membership = await findMembershipForSession(session);

    // Heal session ↔ membership drift (common after SQLite→Firestore cutover).
    if (membership && session.businessId && membership.businessId !== session.businessId) {
      const attached = await attachBusinessToSession(membership.businessId);
      if (attached) session = attached;
    }
    if (!session.businessId && membership) {
      const attached = await attachBusinessToSession(membership.businessId);
      if (attached) session = attached;
    }

    if (!session.businessId) {
      return jsonNoStore({
        authenticated: true,
        needsSetup: true,
        phone: session.phone || null,
        email: session.email,
        role: null,
        homePath: "/",
        business: null,
      });
    }

    if (!membership || membership.businessId !== session.businessId) {
      return jsonNoStore({
        authenticated: true,
        needsSetup: true,
        phone: session.phone || null,
        email: session.email,
        role: null,
        homePath: "/",
        business: null,
      });
    }

    const state = await buildBusinessState(session.businessId);
    if (!state) {
      return jsonNoStore({
        authenticated: true,
        needsSetup: true,
        phone: session.phone || null,
        email: session.email,
        role: null,
        homePath: "/",
        business: null,
      });
    }
    return jsonNoStore({
      authenticated: true,
      needsSetup: false,
      phone: session.phone || null,
      email: session.email,
      role: membership.role,
      homePath: homePathForRole(membership.role),
      business: sanitizeBusinessState(membership.role, state),
    });
  } catch (err) {
    console.error("[api/business GET]", err);
    // Do not claim authenticated:false on transient DB errors — client keeps prior session.
    return jsonNoStore(
      {
        error: err instanceof Error ? err.message : "Database unavailable",
        unavailable: true,
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
      return jsonNoStore({ error: "Please log in first" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: "create" | "sample" | "reset";
      name?: string;
      language?: Lang;
    };

    if (body.action === "reset") {
      const ctx = await requireAccess();
      if (!ctx || !canResetBusiness(ctx.role)) {
        return jsonNoStore(
          { error: "Only equal owners can delete the business account" },
          { status: 403 },
        );
      }
      await deleteBusiness(ctx.business.id);
      await destroySession();
      await persistDb();
      return jsonNoStore({ authenticated: false, business: null });
    }

    // Staff/owners already on a business cannot create another
    if (session.businessId) {
      const membership = await findMembershipForSession(session);
      if (membership) {
        return jsonNoStore({ error: "You already have an account on this login" }, { status: 409 });
      }
    }

    if (body.action !== "create" && body.action !== "sample") {
      return jsonNoStore({ error: "Unknown action" }, { status: 400 });
    }

    if (!publicSignupAllowed()) {
      return jsonNoStore({ error: INVITE_ONLY_MESSAGE }, { status: 403 });
    }

    const name = (body.name || "").trim() || "General Store";
    let ownerName = "Owner";
    if (session.email) {
      const account = await getAuthAccountByEmail(session.email).catch(() => null);
      if (account?.name) ownerName = account.name;
    }
    const created = await createBusiness({
      name,
      language: body.language ?? "en",
      ownerWhatsapp: session.phone || undefined,
      ownerEmail: session.email || undefined,
      ownerName,
      seedSample: body.action === "sample",
    });
    await attachBusinessToSession(created.id);
    await persistDb();
    return jsonNoStore({
      authenticated: true,
      needsSetup: false,
      phone: session.phone || null,
      email: session.email,
      role: "equal_owner",
      homePath: "/dashboard",
      business: await buildBusinessState(created.id),
    });
  } catch (err) {
    console.error("[api/business POST]", err);
    return jsonNoStore(
      { error: err instanceof Error ? err.message : "Could not save your business" },
      { status: 503 },
    );
  }
}
