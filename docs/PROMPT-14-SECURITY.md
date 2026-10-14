# Prompt 14 — Security Hardening

Scope: server-side permission enforcement, business isolation, session revocation,
OTP safeguards, cache hardening, plus exactly two new owner-facing surfaces —
the `/activity` screen and the "Log out everywhere" button in Settings. No other
visible UI changed; the landing page was not touched.

## 1. Route table

| Route | Method | Action(s) | Who may call | What it does | Enforcement |
|---|---|---|---|---|---|
| `/api/business` | GET | — | Anyone with a session cookie (incl. none) | Returns `{authenticated, needsSetup, role, homePath, business}`. Business payload is **role-sanitized**. | `getSession()` + `findMembershipByPhone()`; `sanitizeBusinessState(role, state)` before returning. `jsonNoStore`. |
| `/api/business` | POST | `create` / `sample` | Authenticated phone with **no** existing membership | First-time business setup; caller becomes `equal_owner`. | `requireSession()`; blocks if a membership already exists. |
| `/api/business` | POST | `reset` | `equal_owner` only | Deletes the business + session. | `requireAccess()` + `canResetBusiness(role)`. |
| `/api/stock` | GET | — | Any authenticated member | Returns business state, **sanitized for staff** (purchase prices kept, price history/staff/owners/backups/activity/alerts/Shopify/ownerWhatsapp stripped). | `requireAccess()` + `sanitizeBusinessState()`. `jsonNoStore`. |
| `/api/stock` | PATCH | — (Settings) | Owner (`equal_owner`/`co_owner`); `ownerWhatsapp` field is `equal_owner`-only | Updates business name/language/price threshold/primary WhatsApp. | `requireOwnerAccess("Settings")` — logs a `security`/`access_blocked` activity row if a staff member hits this. |
| `/api/stock` | POST | `addProduct` | Owners + `staff_add` | Adds a product (purchase price always included). | `canAddProduct(role)` |
| `/api/stock` | POST | `addStaff` / `removeStaff` / `updateStaffPermission` | Owners (`equal_owner`/`co_owner`) | Manage staff. Remove/permission-change **revoke that phone's sessions immediately** + log `staff_removed`/`staff_permission_changed`. | `canManagePeople(role)` |
| `/api/stock` | POST | `addOwner` / `removeOwner` | `equal_owner` only | Manage owners. Removing an owner revokes their sessions. | `canManageOwners(role)` |
| `/api/stock` | POST | `recordSale` / `recordPurchasePrice` | Owners only | Deduct stock / change purchase price. | `canAccessPrices(role)` |
| `/api/stock` | POST | `backup` / `sendDailyReport` / `sendMonthlyChart` / `sendWeeklyChart` | Owners only | Reports/backups to owner WhatsApp numbers only. | `canSendReports(role)` |
| `/api/stock` | POST | `resetAccount` | `equal_owner` only | Rejected — must go through `/api/business {action:"reset"}`. | `canResetBusiness(role)` |
| `/api/activity` *(new)* | GET | — | Owners only | Returns up to 200 most recent activity rows for the business. Backs the new `/activity` screen. | `requireOwnerAccess("Activity")` |
| `/api/shopify` | GET/POST | connect/disconnect/sync | Owners only (both tiers) | Shopify catalog sync. | `requireOwnerAccess("Shopify connection")` |
| `/api/system-status` | GET | — | Owners only | Plain-language health check for Settings. | `requireOwnerAccess("System status")` |
| `/api/auth/otp` | POST | `request` / `verify` | Public (unauthenticated) | OTP login. Rate-limited, hashed, attempt-capped. Code is **never logged**. | `createOtp`/`verifyOtp` (see §2) |
| `/api/auth/logout` *(updated)* | POST | `{everywhere?}` | Anyone (clears cookie); `everywhere` only honored for owners | Logs out this device, or (owners only) every session for that phone. | `destroySession()` always; `requireAccess()+isOwnerRole()` re-checked server-side before honoring `everywhere` — the client hiding the button is not trusted alone. |
| `/api/health` *(tightened)* | GET | — | Public gets `{ok, durable}` only; `Authorization: Bearer CRON_SECRET` gets full detail | Readiness probe. | `hasCronSecret()` gates `businessCount`/vendor name |
| `/api/twilio/webhook` | GET/POST | — | Public (Twilio) | WhatsApp Q&A; always scoped to the single business whose owner/staff WhatsApp number matches the sender. | `findBusinessByWhatsapp(phone)` — never a client-supplied id |
| `/api/cron/*` | GET | — | `Authorization: Bearer CRON_SECRET` (or dev mode) | Daily backup / monthly chart / durability marker. | `authorized(request)` per-route |

### Pages

| Path | Who may open it | Enforcement |
|---|---|---|
| `/`, `/login`, `/privacy`, `/terms` | Public | Not in middleware's protected list; Gate.tsx `PUBLIC` |
| `/dashboard`, `/settings`, `/staff`, `/low-stock`, `/prices/[id]`, `/activity` | Owners only | `middleware.ts` redirects to `/login` with no session cookie → `Gate.tsx` `OWNER_ONLY` client redirect → every API call underneath is itself owner-gated |
| `/items` | Any authenticated member | `middleware.ts` cookie check → Gate allows all roles |
| `/add-product` | Owners + `staff_add` | `middleware.ts` cookie check → Gate blocks `staff_view` |

Middleware never talks to Firestore — it only checks whether the session cookie
exists (redirect if a protected page has none) and stamps `Cache-Control: no-store`
on protected pages and all non-public API responses. The real role checks always
happen server-side in the route handlers.

## 2. Already handled vs. fixed

**Already correct — verified, not rebuilt:**
- OTP: hashed `codeHash`, 10-min TTL, 5 attempts, 3-per-10-min rate limit (`lib/session.ts`).
- Sessions: Firestore-backed, keyed by `tokenHash`, `HttpOnly` + `Secure` (prod) + `SameSite=lax` cookie.
- `lib/access.ts` `requireAccess`/`requireOwnerAccess`/`requireEqualOwner`/`can*` helpers.
- Most `/api/stock` actions already role-checked; Shopify/system-status already `requireOwnerAccess`; cron routes already `CRON_SECRET`-gated.
- Activity log writer (`lib/db/activity.ts`) and the original embedded Settings history UI.
- Co-owner limits (Prompt 7): `removeOwner`/`addOwner`/`resetAccount` restricted to `equal_owner` via `canManageOwners`/`canResetBusiness`; Shopify open to both owner tiers.
- Business isolation: every product/business query is scoped by Firestore path `businesses/{id}/...`; grepped the whole `app/` tree — no route ever reads a client-supplied `businessId`, only `ctx.business.id` from the server session.

**Fixed/added in this pass:**
- **A.** `lib/session.ts` — session docs now carry `createdAt/lastSeenAt/expiresAt/revoked/personName/role`; sliding 30-day expiry (`isSessionExpired`, computed from `lastSeenAt`, hard-capped by `expiresAt`) with throttled touch-writes (`shouldTouchSession`, 5-min window); `revokeSessionsForPhone` / `revokeAllSessionsForPhone` / `logoutEverywhere` added; legacy-session migration path backfills the new fields.
- **B.** `removeStaff` + `updateStaffPermission` added to `lib/db/queries.ts`, wired as new `POST /api/stock` actions. Both revoke the affected phone's sessions immediately and record `staff_removed`/`staff_permission_changed` activity. `removeOwner` now also revokes the removed owner's sessions.
- **C.** `lib/api-response.ts` (`jsonNoStore`) applied to every authenticated API route. `lib/permissions.ts` added — `sanitizeBusinessState(role, state)` (staff keep `purchasePrice`, lose `priceHistory`, owners/staff lists, backups, activity, alerts, `ownerWhatsapp`, Shopify) and `allowedStockAction(role, action)` (the permission matrix as a pure, testable function). Wired into `GET /api/stock` and `GET /api/business`. New owner-only `GET /api/activity`. `requireOwnerAccess(routeLabel)` now logs a `security`/`access_blocked` activity row ("*{name} tried to open {routeLabel}. Blocked.*") whenever a logged-in staff member hits an owner-only route.
- **D.** `middleware.ts` added (new file) — redirect-to-login for protected pages with no session cookie; `Cache-Control: no-store` on protected pages + non-public API routes.
- **E.** `app/api/auth/otp/route.ts` — removed the `console.warn` that printed the OTP code. `devCode` is still returned in the JSON response (so `OTP_DEV_MODE` keeps working), just never written to server logs.
- **F.** New owner-only `/activity` page; added to `Gate.tsx`'s `OWNER_ONLY`. Settings' large embedded history block was replaced with a short "Activity →" link; the filterable list now lives on `/activity`, fed by the new `GET /api/activity`.
- **G.** "Log out everywhere" button added to Settings (owner-only). Calls `POST /api/auth/logout {everywhere:true}`; the server re-verifies the caller is an owner before honoring the flag and revokes every session for that phone via `logoutEverywhere()`.
- **H.** Store's `logout()` now accepts an `everywhere` flag; cookie is always cleared; middleware's `no-store` headers prevent cached authenticated pages from showing after logout via the back button.
- **I.** Re-verified (not rebuilt) co-owner limits and Shopify access — see "already correct" above.
- **J.** `tests/security-isolation.test.ts` + `tests/security-routes.contract.test.ts` added, run via `node:test` + `tsx` (no Jest). `lib/permissions.ts` is the thing under test. `tsx` added as a devDependency; `package.json` `"test"` script added.
- **K.** Verified via grep: no route reads a client-supplied `businessId`; all use `ctx.business.id`.
- **L.** `Gate.tsx` `OWNER_ONLY` extended with `/activity`. `components/ProductList.tsx` now shows the purchase price on every stock-list row for **all** roles including staff (per the Prompt 14 decision — staff already saw the price field on Add Product).
- **M.** `lib/types.ts` — `ActivityCategory` gained `"security"`; `ActivityAction` gained `"staff_removed" | "staff_permission_changed" | "access_blocked"`. New i18n keys added **only to the English `en` dictionary** in `lib/i18n.ts` (`activityActionStaffRemoved`, `...StaffPermissionChanged`, `...AccessBlocked`, `activityFilterSecurity`, `goToActivity`, `logOutEverywhere(+Confirm/+Support)`); every other language pack falls back to English automatically via the existing `pack()` merge, so no other language file was touched or broken.

**Explicitly deferred / not built (documented, in scope per "no new shop-owner features"):**
- No UI was added to `/staff` for removing staff or changing their permission — the prompt's "no new shop-owner features except Activity + Log out everywhere" rule took priority. The backend (`removeStaff`, `updateStaffPermission`, their API actions, session revocation, and activity logging) is implemented and unit-tested so it can be wired to UI later without further security work.
- `revokeAllSessionsForBusinessExcept(...)` was explicitly marked optional in the prompt and was skipped — "Log out everywhere" only needed per-phone revocation (`revokeSessionsForPhone`).

## 3. Tests run and results

```
npm test        # tsx --test tests/*.test.ts
  ✔ 107 tests passed, 0 failed, 8 suites (access.ts predicates, permissions.ts
    matrix + sanitizeBusinessState, session.ts sliding expiry/throttle,
    POST /api/stock action matrix, owner-only route contract,
    co-owner limits, addProduct staff_add parity)

npx tsc --noEmit  # clean, no errors

npm run build     # next build — compiled successfully, 27 routes incl. new
                  # /activity and /api/activity, middleware bundle (32.8 kB)
```

Why no live-Firestore / HTTP integration tests: this environment's `.env.local`
Firebase credentials are real project credentials, so hitting Firestore directly
from an automated test run was avoided to not pollute production data. Per the
prompt's own fallback instruction, all tests exercise the **pure, framework-free
logic** that every route handler calls — `lib/access.ts` role predicates,
`lib/permissions.ts` (`allowedStockAction`, `sanitizeBusinessState`), and
`lib/session.ts`'s sliding-expiry/touch-throttle helpers — so the permission
matrix and payload-isolation rules are enforced by a type-checked contract, not
just manual review. If a future CI environment has disposable Firestore
credentials, `tests/security-routes.contract.test.ts`'s matrix can be extended
into real HTTP round-trips against each route.

## 4. Files changed

New: `lib/api-response.ts`, `lib/permissions.ts`, `middleware.ts`,
`app/activity/page.tsx`, `app/api/activity/route.ts`,
`tests/security-isolation.test.ts`, `tests/security-routes.contract.test.ts`,
`docs/PROMPT-14-SECURITY.md`.

Modified: `lib/session.ts`, `lib/access.ts`, `lib/db/queries.ts`,
`lib/activity-display.ts`, `lib/types.ts`, `lib/i18n.ts`, `lib/store.tsx`,
`components/Gate.tsx`, `components/ProductList.tsx`, `app/settings/page.tsx`,
`app/api/stock/route.ts`, `app/api/business/route.ts`,
`app/api/auth/otp/route.ts`, `app/api/auth/logout/route.ts`,
`app/api/shopify/route.ts`, `app/api/system-status/route.ts`,
`app/api/health/route.ts`, `package.json` (+`tsx` devDependency).

Not touched: the landing page (`app/page.tsx`, `components/LandingPage.tsx`,
`components/landing/*`, `app/layout.tsx`) and no visible design changed beyond
(1) the new `/activity` screen, (2) the "Log out everywhere" button, and
(3) showing the purchase price on stock-list rows for every role (an explicit
Prompt 14 decision item, not a new feature).
