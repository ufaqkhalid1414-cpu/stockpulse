/**
 * Idempotency-key helpers for stock-mutating API actions. Every mutating
 * request (`addStock` / `recordSale` / `moveStock` / `correctCount`) must
 * carry a client-generated `idempotencyKey`. If the same key is submitted
 * again within 24h (e.g. the client retried after a timeout, or the user
 * double-tapped "Save"), the mutation is applied at most once — the second
 * call returns the cached result from the first instead of re-applying.
 *
 * Split into two layers on purpose:
 *   - `isIdempotencyRecordExpired` / `withIdempotency` are pure/testable —
 *     they only need a tiny `IdempotencyStore` interface, so unit tests can
 *     use an in-memory fake instead of live Firestore.
 *   - `firestoreIdempotencyStore` is the real adapter used outside of a
 *     transaction. `lib/db/queries.ts`'s `runStockTransaction` re-implements
 *     the same check/record decision *inside* a single Firestore transaction
 *     (so the idempotency check and the stock write commit atomically
 *     together) using the same `isIdempotencyRecordExpired` function.
 */

import { firestoreDb } from "@/lib/db";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyRecord<T = unknown> = {
  createdAt: string;
  result: T;
};

export type IdempotencyStore = {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord): Promise<void>;
};

/** True once `createdAt` is more than `ttlMs` in the past (or unparsable — fail closed to "expired"). */
export function isIdempotencyRecordExpired(createdAt: string, now = Date.now(), ttlMs = IDEMPOTENCY_TTL_MS): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  return now - created > ttlMs;
}

/**
 * Runs `run()` at most once per `key` within the TTL window. A second call
 * with the same key (not yet expired) short-circuits and returns the first
 * call's cached result — `run()` is never invoked again, so a stock mutation
 * never double-applies just because the client retried the same request.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore,
  key: string,
  run: () => Promise<T>,
  now = Date.now(),
): Promise<{ result: T; replayed: boolean }> {
  if (!key || typeof key !== "string") {
    throw new Error("idempotencyKey is required");
  }
  const existing = await store.get(key);
  if (existing && !isIdempotencyRecordExpired(existing.createdAt, now)) {
    return { result: existing.result as T, replayed: true };
  }
  const result = await run();
  await store.set(key, { createdAt: new Date(now).toISOString(), result });
  return { result, replayed: false };
}

/** Firestore-backed store, scoped under the business (never a global/shared collection). */
export function firestoreIdempotencyStore(businessId: string): IdempotencyStore {
  // `firestoreDb()` is only called from inside get/set below — importing this
  // module (e.g. from a node:test file) never touches Firebase at load time.
  const collection = () => firestoreDb().collection("businesses").doc(businessId).collection("idempotencyKeys");
  return {
    async get(key) {
      const snap = await collection().doc(key).get();
      if (!snap.exists) return null;
      const data = snap.data()!;
      return { createdAt: String(data.createdAt ?? ""), result: data.result };
    },
    async set(key, record) {
      await collection().doc(key).set({ businessId, createdAt: record.createdAt, result: record.result });
    },
  };
}
