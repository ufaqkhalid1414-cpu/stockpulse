import { firestoreDb, nowIso } from "@/lib/db";
import type { Location } from "@/lib/types";

/** Legacy 30-minute throttle (Prompt 15) — kept for any non-recount paths. */
export const BLOCKED_STOCK_ALERT_THROTTLE_MS = 30 * 60 * 1000;

function safeKeySegment(value: string) {
  return value.replace(/[^0-9a-zA-Z]/g, "_") || "x";
}

function throttleRef(businessId: string, actorPhone: string, productId: string) {
  const docId = `${safeKeySegment(actorPhone)}__${safeKeySegment(productId)}`;
  return firestoreDb().collection("businesses").doc(businessId).collection("alertThrottle").doc(docId);
}

function recountAlertRef(businessId: string, productId: string, location: Location) {
  const docId = `recount__${safeKeySegment(productId)}__${location}`;
  return firestoreDb().collection("businesses").doc(businessId).collection("alertThrottle").doc(docId);
}

/** Pure decision: should a throttled alert fire, given the last-sent timestamp (if any)? */
export function shouldSendThrottledAlert(
  lastSentAtIso: string | null | undefined,
  now = Date.now(),
  windowMs = BLOCKED_STOCK_ALERT_THROTTLE_MS,
): boolean {
  if (!lastSentAtIso) return true;
  const lastAt = new Date(lastSentAtIso).getTime();
  if (!Number.isFinite(lastAt)) return true;
  return now - lastAt >= windowMs;
}

/**
 * Prompt 15 legacy: one alert per actor+product every 30 minutes.
 * Prefer `shouldAlertOwnersForRecount` for Prompt 16 Part A sales/moves.
 */
export async function shouldAlertOwnersForBlockedStock(
  businessId: string,
  actorPhone: string,
  productId: string,
): Promise<boolean> {
  const ref = throttleRef(businessId, actorPhone, productId);
  const snap = await ref.get();
  const lastSentAt = snap.exists ? String(snap.data()?.lastSentAt ?? "") : null;
  if (!shouldSendThrottledAlert(lastSentAt)) return false;
  await ref.set({ actorPhone, productId, lastSentAt: nowIso() });
  return true;
}

/**
 * Prompt 16 Part A: one owner alert when a product+location first enters
 * "Needs recount". No further alerts until Correct count clears and re-arms.
 */
export async function shouldAlertOwnersForRecount(
  businessId: string,
  productId: string,
  location: Location,
): Promise<boolean> {
  const ref = recountAlertRef(businessId, productId, location);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.armed === false) {
    // Already alerted and still waiting for recount — stay silent.
    return false;
  }
  await ref.set({
    productId,
    location,
    armed: false,
    lastSentAt: nowIso(),
  });
  return true;
}

/** Call after Correct count clears the flag — re-arms the next recount alert. */
export async function rearmRecountAlert(
  businessId: string,
  productId: string,
  location: Location,
): Promise<void> {
  const ref = recountAlertRef(businessId, productId, location);
  await ref.set(
    {
      productId,
      location,
      armed: true,
      clearedAt: nowIso(),
    },
    { merge: true },
  );
}
