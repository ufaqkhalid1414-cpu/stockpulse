# Prompt 9 — Firebase/Firestore Migration (gap-fill pass)

Scope: this pass only fills the specific gaps listed for Prompt 9. Firestore
was already the live database via the Admin SDK before this pass started —
nothing about the database wiring, auth flow, or product/location model was
rebuilt. See "Already present" below for what was verified, not touched.

## 1. Already present — verified, not rebuilt

- Firestore is the live database via `firebase-admin` (`lib/db/index.ts`,
  `lib/db/queries.ts`, `lib/firebase/admin.ts`). `usingFirestore()` /
  `firebaseConfigured()` gate every code path; there is no SQLite/Turso
  fallback left active (`getDb()` throws by design).
- Auth is WhatsApp OTP only (`app/api/auth/otp/route.ts`, `lib/session.ts`).
  **Behavior unchanged** — see §2 below for what was added (logging only,
  no flow/validation/cookie/rate-limit change).
- Products keep three independent location quantities — `warehouseQty`,
  `shopQty`, `onlineQty` — never collapsed into one number. `recordSale`
  and `recordPurchasePrice` in `lib/db/queries.ts` still own the Firestore
  writes; this pass only extracted their pure math into new modules (§3).
- Multi-tenant paths: every tenant-scoped collection lives under
  `businesses/{businessId}/...` (`products`, `priceHistory`, `sales`,
  `owners`, `staff`, `alerts`, `backupHistory`, `activity`, `shopify`).
- `firestore.rules` already denied all client access (correct for an
  Admin-SDK-only app) — rewritten with documentation in §4, behavior
  unchanged (still `allow read, write: if false` for everything).
- Backups (`runBackup`/`runDailyBackups`), owners/staff management, and OTP
  rate limiting (`lib/session.ts`) all already existed and were not rebuilt.
- Tests use `tsx --test` (`node:test`), not Jest — kept that convention for
  every new test file; no test framework was added.
- Prompt 14 security work (role matrix, session revocation, activity log,
  middleware) was already landed and is untouched by this pass.

## 2. Fixed/added in this pass

**A. Pure business-logic modules + unit tests**
- `lib/stock-math.ts` (new) — `totalAcrossLocations`, `qtyAtLocation`,
  `applyStockDeduction` (throws on oversell / invalid qty; deducts exactly
  one location; total is always a recomputed sum, never a stored field).
- `lib/price-math.ts` (new) — `purchasePriceChangePct`,
  `shouldAlertOnPurchasePriceChange` (inclusive `>=` threshold, matches the
  original inline logic in `recordPurchasePrice`).
- `lib/tenant.ts` (new) — `businessPath(businessId, ...segments)`,
  `isScopedToBusiness(path, businessId)`, `assertSameBusiness(sessionId,
  resourceId)`. Pure path-scoping helpers documenting/testing the
  `businesses/{businessId}/...` tree without touching Firestore.
- `lib/db/queries.ts` — `recordSale` now calls `applyStockDeduction()`
  instead of inlining the warehouse/shop/online branching; `recordPurchasePrice`
  now calls `purchasePriceChangePct()` / `shouldAlertOnPurchasePriceChange()`
  instead of inlining the percent-change math. Firestore reads/writes
  (`batch.set`, `createAlert`, etc.) are unchanged — only the math moved.
- New tests: `tests/stock-math.test.ts` (deduction at each location, total
  recalculation, oversell/invalid-qty rejection, no-mutation check),
  `tests/price-math.test.ts` (threshold boundary cases — exactly-at,
  just-under, just-over, for both price jumps and drops, plus
  divide-by-zero guards), `tests/tenant-isolation.test.ts` (`businessPath`/
  `isScopedToBusiness`/`assertSameBusiness` pure-function proofs + a
  `sanitizeBusinessState` cross-tenant-bleed check). All three are
  Firebase-free — no `firebase-admin` import, no live credentials needed.

**B. Structured logging**
- `lib/logger.ts` (new) — `logInfo`/`logWarn`/`logError(event, fields, err?)`.
  JSON-line output to console. Defensively strips a fixed set of sensitive
  key names (`code`, `otp`, `token`, `sessionToken`, `tokenHash`, `codeHash`)
  from any fields object before printing. `logError` optionally forwards to
  Sentry only if `SENTRY_DSN` is set AND `@sentry/node` happens to be
  installed (it is not a dependency of this repo) — otherwise a pure no-op;
  never throws.
- Instrumented surgically (not flooded):
  - `app/api/auth/otp/route.ts` — `otp_requested` / `otp_request_failed` /
    `otp_verified` / `otp_verify_failed` / `otp_route_error`. **The OTP code
    itself is never passed to the logger** (verified by reading every call
    site — only `phone`, `method`, `reason`, `businessId`, `role` are logged).
    The one pre-existing `console.warn` that printed a dev-mode notice was
    replaced with `logInfo`, still without the code.
  - `lib/db/queries.ts` — `backup_run` (success/failure, in `runBackup`'s
    existing try/catch), `price_alert_triggered` (in `recordPurchasePrice`,
    when the threshold fires), `stock_deducted` + `low_stock_alert_triggered`
    (in `recordSale`), `phone_index_stale` warning (existing fallback path).
  - `app/api/cron/daily-backup/route.ts` — one `daily_backup_cron_run`
    summary line (businesses/ok/failed counts) per cron invocation.

**C. System Status → Firebase**
- `lib/i18n.ts` — English-only additions: `statusDatabase` now reads
  "Database (Firebase)"; new `statusFirebaseConnected` = "Firebase
  connected"; `statusDatabaseBad` now briefly mentions Firebase. Every other
  language pack (`ur`, `zh`, `de`, `ar`, `es`, `fr`, `hi`, `pt`) was **not**
  edited — they all fall back to the English string automatically via the
  existing `pack()` merge (`{ ...en, ...dict }`), exactly like the Prompt 14
  precedent for untranslated keys.
- `app/api/system-status/route.ts` — response now includes
  `database.provider: "firebase"` (via `usingFirestore()`) and a
  Firebase-aware `detail`/`hint` string for owners, still plain language,
  no stack traces or vendor error codes.
- `app/settings/page.tsx` — `StatusLine` for the database row now shows
  "Firebase connected" (via the new `statusFirebaseConnected` i18n key)
  when `systemStatus.database.provider === "firebase"`, else falls back to
  the original "Connected" text.

**D. Firestore Security Rules (Firebase-correct)**
- `firestore.rules` rewritten with a documented multi-tenant tree comment
  (`businesses/{businessId}/products|priceHistory|sales|owners|staff|alerts|
  backupHistory|activity|shopify`, plus top-level `phoneIndex`/`sessions`/OTP
  collections) and an explicit explanation of why "deny all client access"
  is the *correct* rule here: there is no Firebase client SDK anywhere in
  this codebase, so the Admin SDK (which bypasses these rules) is the only
  thing that ever talks to Firestore. Isolation is enforced by (a)
  Admin-only writes and (b) server-side session `businessId` scoping in
  `lib/access.ts`/`lib/db/queries.ts` — never a client-supplied id. The
  rule behavior itself (`allow read, write: if false` for every document)
  is unchanged — this is a documentation-correctness fix, not a behavior
  change, per the prompt's own framing ("real Firestore Security Rules...
  better than fake client rules that never run").
- `firestore.indexes.json` — removed two composite indexes
  (`priceHistory` on `productId`+`recordedAt`, ASC and DESC) that did not
  match any query actually issued by the code: `listPriceHistoryDocs`
  queries `where("productId", "==", ...)` only (no `orderBy` in the same
  query — sorting happens in JS afterward, specifically to avoid needing a
  composite index, per the existing comment at that function). Grepped
  every `.where()`/`.orderBy()` call in the repo (`lib/db/queries.ts`,
  `lib/db/activity.ts`, `lib/session.ts`) — no query combines an equality
  filter with an `orderBy` on a different field, so zero composite indexes
  are currently required. Left `indexes: []` rather than inventing unused
  ones, per the prompt's instruction.

**E. Domain flag**
- No custom domain is assumed anywhere in this pass. Links use
  `NEXT_PUBLIC_SITE_URL` when set, falling back to the Vercel-provided
  `VERCEL_URL` (see `lib/seo.ts` `siteUrl()`, pre-existing, unmodified).
  When a real domain is purchased, set `NEXT_PUBLIC_SITE_URL` (and any
  Firebase/Twilio allow-list entries that reference the domain) as
  environment variables only — no code rewrite is required beyond env
  configuration. DNS setup itself is explicitly out of scope / skipped for
  this pass.

## 3. Files changed

**New:**
`lib/stock-math.ts`, `lib/price-math.ts`, `lib/tenant.ts`, `lib/logger.ts`,
`tests/stock-math.test.ts`, `tests/price-math.test.ts`,
`tests/tenant-isolation.test.ts`, `docs/PROMPT-9-FIRESTORE.md`.

**Modified:**
`lib/db/queries.ts` (wired `stock-math`/`price-math` helpers into
`recordSale`/`recordPurchasePrice`; added `logInfo`/`logWarn`/`logError`
calls at the points listed in §2.B — no Firestore write/read behavior
changed), `app/api/auth/otp/route.ts` (structured logging only; OTP
request/verify flow, validation, rate limiting, and cookie behavior are
byte-for-byte the same as before), `app/api/cron/daily-backup/route.ts`
(one summary log line), `app/api/system-status/route.ts` (`provider`
field + Firebase-aware detail text), `app/settings/page.tsx`
(Firebase-aware `StatusLine` value for the database row), `lib/i18n.ts`
(English-only key additions, see §2.C), `firestore.rules` (documentation
rewrite, same deny-all behavior), `firestore.indexes.json` (removed two
unused composite indexes).

**Not touched:** the landing page (`app/page.tsx`, `components/LandingPage.tsx`,
`components/landing/*`), WhatsApp OTP login flow/behavior (only logging was
added around it), the product/location data model (still three independent
quantities per product), any other language pack in `lib/i18n.ts`.

## 4. Tests run and results

```
npm test          # tsx --test tests/*.test.ts
  ✔ 149 tests passed, 0 failed, 17 suites
    (8 pre-existing suites from Prompt 14 unchanged and still green, plus
     new suites: stock-math.ts totalAcrossLocations/qtyAtLocation/
     applyStockDeduction, price-math.ts purchasePriceChangePct/
     shouldAlertOnPurchasePriceChange, tenant.ts businessPath/
     isScopedToBusiness/assertSameBusiness, and a sanitizeBusinessState
     cross-tenant-bleed check)

npx tsc --noEmit  # clean, no errors
```

No live-Firestore integration tests were added, for the same reason
documented in `docs/PROMPT-14-SECURITY.md`: this environment's
`.env.local` holds real Firebase project credentials, so exercising
Firestore directly from an automated test run was avoided to not touch
production data. Every new test file imports only pure, framework-free
modules (`lib/stock-math.ts`, `lib/price-math.ts`, `lib/tenant.ts`,
`lib/permissions.ts`) — none import `firebase-admin` or `lib/db/queries.ts`
directly, so `npm test` never needs Firebase credentials to pass.

## 5. WhatsApp OTP — confirmed untouched

Re-read `app/api/auth/otp/route.ts` end-to-end after editing: the
`request`/`verify` action branching, phone/code validation
(`isValidPhone`, `/^\d{6}$/`), `createOtp`/`verifyOtp`/`createSession`
calls, Twilio-vs-dev-mode branching, HTTP status codes, response shapes,
and the session cookie (`SESSION_COOKIE`, `sessionCookieOptions()`) are
all identical to before this pass. The only change is five `logInfo`/
`logWarn`/`logError` calls added around existing branches and one
`console.warn` → `logInfo` swap (still never logging the code). The
security-routes contract tests (`tests/security-routes.contract.test.ts`,
pre-existing) and the full `tests/security-isolation.test.ts` suite both
still pass unmodified, confirming no permission/session behavior shifted.

## 6. DNS / custom domain

Skipped, as scoped — see §2.E above.
