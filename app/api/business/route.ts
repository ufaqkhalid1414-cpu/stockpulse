import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildBusinessState, createBusiness, deleteBusiness, listBusinesses } from "@/lib/db/queries";
import { BUSINESS_COOKIE } from "@/lib/session";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const id = jar.get(BUSINESS_COOKIE)?.value;
  if (!id) {
    return NextResponse.json({ business: null, businesses: listBusinesses().map((b) => ({ id: b.id, name: b.name })) });
  }
  const state = buildBusinessState(id);
  if (!state) {
    jar.delete(BUSINESS_COOKIE);
    return NextResponse.json({ business: null, businesses: listBusinesses().map((b) => ({ id: b.id, name: b.name })) });
  }
  return NextResponse.json({ business: state });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: "create" | "sample" | "switch" | "reset";
    name?: string;
    language?: Lang;
    ownerWhatsapp?: string;
    businessId?: string;
  };

  if (body.action === "switch" && body.businessId) {
    const state = buildBusinessState(body.businessId);
    if (!state) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    const jar = await cookies();
    jar.set(BUSINESS_COOKIE, body.businessId, { path: "/", httpOnly: false, sameSite: "lax" });
    return NextResponse.json({ business: state });
  }

  if (body.action === "reset") {
    const jar = await cookies();
    const id = jar.get(BUSINESS_COOKIE)?.value;
    if (id) deleteBusiness(id);
    jar.delete(BUSINESS_COOKIE);
    return NextResponse.json({ business: null });
  }

  const name = (body.name || "").trim() || "General Store";
  const created = createBusiness({
    name,
    language: body.language ?? "en",
    ownerWhatsapp: body.ownerWhatsapp,
    seedSample: body.action === "sample",
  });
  const jar = await cookies();
  jar.set(BUSINESS_COOKIE, created.id, { path: "/", httpOnly: false, sameSite: "lax" });
  return NextResponse.json({ business: buildBusinessState(created.id) });
}
