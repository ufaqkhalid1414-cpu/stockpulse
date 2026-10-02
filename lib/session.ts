import { cookies } from "next/headers";
import { getBusiness } from "@/lib/db/queries";

export const BUSINESS_COOKIE = "stockpulse_business_id";

export async function getSessionBusinessId() {
  const jar = await cookies();
  return jar.get(BUSINESS_COOKIE)?.value ?? null;
}

export async function requireBusiness() {
  const id = await getSessionBusinessId();
  if (!id) return null;
  const business = getBusiness(id);
  if (!business) return null;
  return business;
}
