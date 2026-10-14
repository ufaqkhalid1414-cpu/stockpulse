# Prompt 15 — Stock Accuracy

Scope: atomic, idempotent, never-below-zero stock mutations (add / sell / move /
correct), a role matrix extended to cover them, soft-delete (archive/restore)
for products, and the minimum UI needed to drive all of it from the existing
product list. The landing page was not touched; no design-system primitives
were changed — only new buttons, a modal/sheet, and new strings were added.

## 1. Audit — what was already there vs. what Prompt 15 added

**Already correct — verified, not rebuilt:**

- Three independent location fields (`warehouseQty`/`shopQty`/`onlineQty`) and
  `totalQty`/`totalAcrossLocations` as the *only* definition of "total" — never
  stored as its own field (`lib/stock-math.ts`, `lib/metrics.ts`).
- `addProduct` and `recordPurchasePrice` in `lib/db/queries.ts`.
- Activity log writer (`lib/db/activity.ts`, Prompt 14) and `actorFromAccess`.
- Role checks (`lib/access.ts`), `staff_add` vs `staff_view` distinction,
  `allowedStockAction` permission matrix (`lib/permissions.ts`).
- `VoiceInput` component and `piecesPerCarton` support (Prompt 12), reused
  as-is by the new stock-action sheet.
- Test suite style: `node:test` + `tsx`, **not** Jest — `tests/stock-math.test.ts`,
  `tests/price-math.test.ts`, `tests/security-isolation.test.ts`,
  `tests/security-routes.contract.test.ts`, `tests/tenant-isolation.test.ts`.
- `recordSale`'s original "deduct from exactly one location, throw on
  oversell" logic — this was the starting point for `applyStockDeduction`.

**Gap found and fixed — the permission-matrix conflict:**

Prompt 14's matrix gated `recordSale` behind `canAccessPrices` (owner-only).
Prompt 15 explicitly requires `staff_add` to call `addStock`/`recordSale`/
`moveStock`. Introduced `canMutateStock` (alias of `canAddProduct`) and
rewired `recordSale`'s gate to it, then updated the two affected test files
(`security-isolation.test.ts`, `security-routes.contract.test.ts`) to encode
the new, intended matrix instead of leaving them asserting the old one.

**Added in this pass:**

1. **Pure stock math** (`lib/stock-math.ts`) — `applyStockAdd`,
   `applyStockMove`, `applyStockCorrection`, plus a structured
   `InsufficientStockError` (`code`/`location`/`available`) that
   `applyStockDeduction` now throws instead of a generic `Error`.
2. **Firestore transactions** (`lib/db/queries.ts`) — every stock mutation
   (`addStock`, `recordSale`, `moveStock`, `correctCount`) runs inside a
   single `firestoreDb().runTransaction(...)` that reads the product doc,
   reads/writes the idempotency doc, and writes the new quantities — never a
   separate read-calculate-write outside a transaction.
3. **Never below zero + throttled owner alert** — insufficient stock aborts
   with **no write**; the API maps it to `Only {n} left in {place}. Nothing
   was recorded.`; a `stock_blocked` Activity row is logged; a WhatsApp alert
   to the owners is throttled to one per actor-phone + product per 30 minutes
   (`lib/alert-throttle.ts`).
4. **Idempotency keys, 24h TTL** (`lib/idempotency.ts`) — generic
   `withIdempotency(store, key, run, now)` (pure, testable against an
   in-memory fake store) plus a Firestore-backed adapter and
   `isIdempotencyRecordExpired`. Every stock-mutating `POST` now requires an
   `idempotencyKey`; replays within 24h return the cached result without
   re-applying.
5. **New API actions** on `POST /api/stock`: `addStock`, `moveStock`
   (owners + `staff_add`), `correctCount`, `editProduct`, `archiveProduct`,
   `restoreProduct` (owners only). `recordSale` upgraded to the transaction +
   idempotency + structured-error path.
6. **New permission predicates** (`lib/access.ts`): `canMutateStock`,
   `canCorrectStock`, `canEditProduct`, `canArchiveProduct`. Staff label copy
   updated to *"Can add, sell, and move stock"*.
7. **Soft delete**: `Product.archived` flag; `getProducts` excludes archived
   by default; `buildBusinessState` splits `products` / `archivedProducts`;
   staff never see `archivedProducts` (`sanitizeBusinessState`).
8. **UI**: `components/StockActions.tsx` — three ≥48px buttons ("Add stock",
   "Record sale", "Move stock") on every product row for owners + `staff_add`
   (none for `staff_view`), plus owner-only "Correct count / Edit product /
   Archive" row. A shared modal/sheet drives all seven actions: product
   photo, `VoiceInput`-backed amount field, pieces/carton support, one
   `crypto.randomUUID()` idempotency key generated when the sheet opens and
   reused across retries, `Save` → `Saving…` → `Saved ✓ — new total {n}` or
   `Failed, Retry` (same key). Owner-only confirm step for archive/restore.
   `app/items/page.tsx` gained a collapsible "Archived products" panel with a
   `Restore` button, owners only.
9. **Activity logging** — every successful mutation and every blocked attempt
   is logged with who/what/when/before/after (`stock_added`, `stock_moved`,
   `stock_corrected`, `stock_blocked`, `product_edited`, `product_archived`,
   `product_restored`).

## 2. Route table (new/changed rows only — see `PROMPT-14-SECURITY.md` for the rest)

| Route | Method | Action | Who may call | What it does | Enforcement |
|---|---|---|---|---|---|
| `/api/stock` | POST | `recordSale` | Owners + `staff_add` *(was owners-only)* | Deducts stock at one location, inside a transaction, idempotent. | `canMutateStock(role)` + `idempotencyKey` required |
| `/api/stock` | POST | `addStock` | Owners + `staff_add` | Adds stock at one location. Never triggers a low-stock alert, only clears the debounce flag. | `canMutateStock(role)` + `idempotencyKey` required |
| `/api/stock` | POST | `moveStock` | Owners + `staff_add` | Moves stock between two locations; grand total never changes; never touches the low-stock debounce flag. | `canMutateStock(role)` + `idempotencyKey` required |
| `/api/stock` | POST | `correctCount` | Owners only | Sets an absolute recount at one location (never "insufficient stock"). | `canCorrectStock(role)` + `idempotencyKey` required |
| `/api/stock` | POST | `editProduct` | Owners only | Edits name/category/variant/photo/threshold/piecesPerCarton — **never** quantities. | `canEditProduct(role)` |
| `/api/stock` | POST | `archiveProduct` / `restoreProduct` | Owners only | Soft-deletes/restores a product (`archived` flag); archived products are excluded from lists/alerts/reports by default. | `canArchiveProduct(role)` |

All six new/changed actions, on insufficient stock, return
`400 { error, code: "INSUFFICIENT_STOCK", available, location }` with **no
write**, log a `stock_blocked` Activity row, and (throttled) notify owners on
WhatsApp.

## 3. Idempotency and transaction design

- The idempotency-doc read/write happens **inside the same Firestore
  transaction** as the stock mutation (`runStockTransaction` in
  `lib/db/queries.ts`), so a replayed key and its guarded mutation can never
  diverge or half-apply.
- `isIdempotencyRecordExpired(createdAt, now, ttlMs)` is a pure function
  (24h TTL, `IDEMPOTENCY_TTL_MS`), reused by both the transactional path and
  the generic `withIdempotency` helper — independently unit-testable with an
  in-memory fake store, no Firestore required.
- A missing/blank `idempotencyKey` is rejected with a 400 before any work
  starts, and before `run()`/the transaction ever executes.

## 4. Test results

```
npm test
ℹ tests 227
ℹ suites 27
ℹ pass 227
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0

npx tsc --noEmit
(no output — exit code 0)
```

`tests/stock-accuracy.test.ts` (new) covers, against the spec's own numbers:

- The exact walkthrough: 50+20+10 = 80 total → add 5 to shop → 85 → remove 10
  from warehouse → 70 → chained add+remove → 75.
- `applyStockAdd` / `applyStockMove` / `applyStockCorrection`: correct target
  location, total invariants (unchanged for move, correctly delta'd for
  add/correct), rejection of zero/negative/non-finite/`NaN`/`Infinity`
  quantities, `from === to` rejected as a plain `Error`, moving more than the
  source has rejected as `InsufficientStockError` (not borrowed from a third
  location), inputs never mutated.
- Oversell rejection via `applyStockDeduction` → `InsufficientStockError`
  with `code`/`location`/`available` attached, state unchanged.
- "Simultaneous changes" — documents that true concurrency safety is
  Firestore's job (`runTransaction`); the pure-math layer is proven correct
  under sequential composition (two sales, or sale+restock+move, from the
  same base).
- `withIdempotency` against an in-memory fake store: same key twice → one
  apply, second call returns the cached result; different keys apply
  independently; blank key rejected before `run()`; an expired (25h-old) key
  is treated as fresh and re-applies; `isIdempotencyRecordExpired` boundary
  checks (just-under/just-over 24h) and fail-closed behavior on garbage
  input.
- Permission matrix: `staff_view` blocked from every stock action;
  `staff_add` allowed `addStock`/`recordSale`/`moveStock` but blocked from
  `correctCount`/`editProduct`/`archiveProduct`/`restoreProduct`; both owner
  tiers allowed all seven actions.

`tests/security-isolation.test.ts` and `tests/security-routes.contract.test.ts`
were updated (not just left passing) to encode the Prompt 15 matrix —
`recordSale` moving from owner-only to owners + `staff_add`, and the six new
action names added to every matrix table they maintain.

## 5. Verification checklist

- [x] Pure math has no Firestore/I/O — `lib/stock-math.ts` imports only
      `@/lib/types`.
- [x] Every stock mutation is wrapped in `firestoreDb().runTransaction(...)` —
      no read-calculate-write happens outside a transaction
      (`runStockTransaction` in `lib/db/queries.ts`).
- [x] Insufficient stock aborts with no write, structured error, Activity log,
      and throttled WhatsApp alert.
- [x] Idempotency keys required on every stock-mutating POST; 24h TTL; replay
      returns the cached result instead of re-applying.
- [x] Permission matrix matches the spec: `addStock`/`recordSale`/`moveStock`
      → owners + `staff_add`; `correctCount`/`editProduct`/`archiveProduct`/
      `restoreProduct` → owners only.
- [x] UI buttons are ≥48px, hidden entirely for `staff_view`.
- [x] Save button states: `Saving…` (disabled) → `Saved ✓ — new total {n}`
      or `Failed, Retry` (same idempotency key).
- [x] Totals are never stored independently — always
      `totalAcrossLocations(...)` at read time.
- [x] Edit product never touches quantities (`editProduct` only accepts
      `name`/`category`/`variant`/`photo`/`restockThreshold`/
      `piecesPerCarton`).
- [x] Move never triggers or clears the low-stock debounce flag by itself
      (`moveStock` doesn't touch `lowStockAlerted`); `addStock` only clears
      it, never triggers it.
- [x] Archived products excluded from `getProducts()` by default, and from
      `sanitizeBusinessState`'s staff payload entirely.
- [x] Landing page (`app/page.tsx`, `components/LandingPage.tsx`,
      `components/landing/*`, `app/layout.tsx`) not modified — confirmed via
      `git diff --stat`.
- [x] `npm test` — 227/227 passing. `npx tsc --noEmit` — clean.
- [x] No commits or pushes made.

## 6. Files changed

**New:** `lib/stock-math.ts` (extended with new exports), `lib/idempotency.ts`,
`lib/alert-throttle.ts`, `components/StockActions.tsx`,
`tests/stock-accuracy.test.ts`, `docs/PROMPT-15-STOCK-ACCURACY.md`.

**Modified:** `lib/types.ts`, `lib/access.ts`, `lib/permissions.ts`,
`lib/db/queries.ts`, `lib/activity-display.ts`, `lib/i18n.ts`,
`lib/store.tsx`, `app/api/stock/route.ts`, `app/prices/[id]/page.tsx`,
`components/ProductList.tsx`, `app/items/page.tsx`,
`tests/security-isolation.test.ts`, `tests/security-routes.contract.test.ts`,
`firestore.rules` (comment-only — documented the two new subcollections,
already covered by the existing `allow read, write: if false` blanket rule).
