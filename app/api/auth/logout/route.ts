import { isOwnerRole, requireAccess } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { ensureDbReady, persistDb } from "@/lib/db";
import { BUSINESS_COOKIE, destroySession, logoutEverywhere, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDbReady();

  let everywhere = false;
  try {
    const body = (await request.json()) as { everywhere?: boolean } | null;
    everywhere = Boolean(body?.everywhere);
  } catch {
    // No/invalid JSON body — treat as a normal single-device logout.
    everywhere = false;
  }

  // "Log out everywhere" is owner-only; server-side re-check (the Settings
  // button is also hidden from staff, but never trust the client alone).
  if (everywhere) {
    const ctx = await requireAccess();
    if (ctx && isOwnerRole(ctx.role)) {
      await logoutEverywhere(ctx.session.phone).catch(() => undefined);
    }
  }

  await destroySession();
  await persistDb();
  const res = jsonNoStore({ ok: true, authenticated: false, business: null });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(BUSINESS_COOKIE);
  return res;
}
