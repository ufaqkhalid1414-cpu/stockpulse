import { ensureDbReady, firestoreDb, newId, nowIso } from "@/lib/db";
import type {
  AccessRole,
  ActivityAction,
  ActivityCategory,
  ActivityHistoryItem,
  Location,
} from "@/lib/types";
import type { DocumentData } from "firebase-admin/firestore";

export type ActivityActor = {
  /** Stable identity — WhatsApp phone normalized */
  phone: string;
  name: string;
  role: AccessRole;
};

export type ActivityInput = {
  category: ActivityCategory;
  action: ActivityAction;
  actor: ActivityActor;
  productId?: string | null;
  productName?: string | null;
  location?: Location | null;
  fromLocation?: Location | null;
  toLocation?: Location | null;
  quantityChange?: number | null;
  previousValue?: number | null;
  newValue?: number | null;
  previousTotal?: number | null;
  newTotal?: number | null;
  summary: string;
  detail?: string | null;
};

function activityCol(businessId: string) {
  return firestoreDb().collection("businesses").doc(businessId).collection("activity");
}

function mapDoc(id: string, data: DocumentData): ActivityHistoryItem {
  return {
    id,
    category: data.category as ActivityCategory,
    action: data.action as ActivityAction,
    actorPhone: String(data.actorPhone ?? ""),
    actorName: String(data.actorName ?? ""),
    actorRole: data.actorRole as AccessRole,
    productId: data.productId ?? null,
    productName: data.productName ?? null,
    location: (data.location as Location) ?? null,
    fromLocation: (data.fromLocation as Location) ?? null,
    toLocation: (data.toLocation as Location) ?? null,
    quantityChange: data.quantityChange == null ? null : Number(data.quantityChange),
    previousValue: data.previousValue == null ? null : Number(data.previousValue),
    newValue: data.newValue == null ? null : Number(data.newValue),
    previousTotal: data.previousTotal == null ? null : Number(data.previousTotal),
    newTotal: data.newTotal == null ? null : Number(data.newTotal),
    summary: String(data.summary ?? ""),
    detail: data.detail ?? null,
    status: "success",
    createdAt: String(data.createdAt ?? ""),
  };
}

/** Write only after the real mutation succeeded. Actor must come from server session. */
export async function recordActivity(businessId: string, input: ActivityInput): Promise<ActivityHistoryItem> {
  await ensureDbReady();
  const id = newId();
  const createdAt = nowIso();
  const row = {
    category: input.category,
    action: input.action,
    actorPhone: input.actor.phone,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    productId: input.productId ?? null,
    productName: input.productName ?? null,
    location: input.location ?? null,
    fromLocation: input.fromLocation ?? null,
    toLocation: input.toLocation ?? null,
    quantityChange: input.quantityChange ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    previousTotal: input.previousTotal ?? null,
    newTotal: input.newTotal ?? null,
    summary: input.summary,
    detail: input.detail ?? null,
    status: "success" as const,
    createdAt,
  };
  await activityCol(businessId).doc(id).set(row);
  return mapDoc(id, row);
}

export async function listActivity(businessId: string, limit = 100): Promise<ActivityHistoryItem[]> {
  await ensureDbReady();
  const snap = await activityCol(businessId).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => mapDoc(d.id, d.data()));
}

export function actorFromAccess(ctx: {
  session: { phone: string };
  membership: { name: string; phone: string; role: AccessRole };
}): ActivityActor {
  return {
    phone: ctx.membership.phone || ctx.session.phone,
    name: ctx.membership.name?.trim() || ctx.session.phone,
    role: ctx.membership.role,
  };
}
