# StockPulse — Master App Prompt

Use this prompt whenever you need a full written picture of the product: what it is, how it works, what was built, and how the pieces connect. Copy from **START PROMPT** to **END PROMPT**.

---

## START PROMPT

You are working on **StockPulse**, a calm inventory web app for shop owners who sell in more than one place.

### What StockPulse is

StockPulse is a multi-tenant inventory system. Each **business** is isolated. Owners and staff sign in with **WhatsApp OTP** (no passwords, no Gmail login for end users). Stock is always tracked in **three separate places**:

1. **Warehouse**
2. **Shop** (shop floor)
3. **Online**

Total stock for a product is the sum of those three. Never merge them into one quantity field.

The product idea: one calm picture of what you have — stock value, low stock, and purchase-price moves — not a wall of charts.

### Who uses it

| Role | Home after login | What they can do |
|------|------------------|------------------|
| Equal owner | `/dashboard` | Full app: dashboard, items, add product, low stock, prices, owners & staff, settings, backups, system status, Shopify |
| Co-owner | `/dashboard` | Most owner features; limited owner-management rules |
| Staff (add) | `/add-product` | Add products and view items — **not** dashboard, settings, prices, or staff management |
| Staff (view) | `/items` | Read-only product list only |

A client **Gate** enforces routes. APIs also check role before writes. Unauthenticated users go to `/login`.

### Tech stack (as built / documented)

- **Frontend:** Next.js (React, TypeScript), Tailwind CSS  
- **Backend:** Next.js API routes (same Node/TypeScript codebase)  
- **Hosting:** Vercel  
- **Version control:** Git  
- **Login / alerts:** WhatsApp via Twilio for testing; later a real WhatsApp BSP for production  
- **Data (runtime today):** SQLite via libSQL (local file; optional Turso); durable sync / backups via **Vercel Blob**  
- **Data (chosen direction in docs):** Firebase (Firestore + Storage) for the database story in handoff docs  
- **Languages in UI:** English and Urdu (i18n), language switcher on landing and in-app  
- **Look:** Cream `#FAF6EE`, navy `#2D3B5E`, gold accent, pine (good), clay (alerts/errors), font DM Sans, wordmark **StockPulse** (no fixed logo file yet)

Do **not** add Resend email, custom DNS/domain, Gmail login, clipping, or transcribe product modules unless the owner asks.

---

### Landing page `/` (what was built)

The landing is a **marketing + entry** composition for StockPulse:

- **Header:** Brand wordmark “StockPulse”, nav links “How it works” and “Why StockPulse”, language menu, CTA button **Sign in with WhatsApp** → `/login`
- **Hero (one composition):** Large brand name StockPulse, gold underline, headline: *See warehouse, shop, and online stock in one calm place.* Support: built for shop owners who sell in more than one place — WhatsApp login, daily reports, price alerts. Primary CTA Sign in with WhatsApp; secondary “See how it works”. A **live stock view** visual plane shows Warehouse / Shop / Online with sample product (e.g. Basmati Rice · 5 kg) and status “Everything looks fine today.”
- **How it works (3 steps):**
  1. Sign in on WhatsApp — number + one-time code; same login for owners and staff  
  2. Add or sync stock — type, voice, or connect Shopify for online inventory  
  3. Get reports where you already are — daily WhatsApp summaries and monthly price charts to **owner numbers only**
- **Why StockPulse (features):** Multi-place stock; WhatsApp-native price alerts; staff that can help (add or view only — never owner dashboard); Shopify when ready
- **Close:** Ready when your shop is — sign in and set up in a few minutes  
- **Footer:** Calm inventory for shop owners across warehouse, shop, and online  

Authenticated users are redirected away from `/` into the app; only guests see the landing.

---

### How login works

1. User opens `/login` (from landing CTA or Gate redirect).  
2. Enters WhatsApp number → server `/api/auth/otp` requests a code (**max 3 requests per 10 minutes**).  
3. User enters **6-digit code** → verified → **session cookie ~30 days**.  
4. If new account: **setup business name** on the same login area (`/api/business`).  
5. Role decides home: owner → dashboard; staff add → add-product; staff view → items.  
6. Logout clears session via `/api/auth/logout`.  

Dev/testing can use OTP shown on screen when Twilio is not required (`OTP_DEV_MODE`). Production path uses WhatsApp delivery.

---

### How the in-app product works (screens)

| Route | Purpose |
|-------|---------|
| `/dashboard` | Owner: total stock value, different items count, low stock count, alerts, recent price changes |
| `/items` | Product list with per-location quantities |
| `/add-product` | Create products (owners + staff add) |
| `/low-stock` | Products below restock threshold |
| `/prices/[id]` | Price history / charts, record sale (pick location), update purchase price |
| `/staff` | Manage owners (equal/co) and staff (add/view), phones required |
| `/settings` | Language, price threshold, Shopify connect/sync, **Back up now**, **Backup History**, owner **System Status** (DB · WhatsApp · last backup) |

**Sales** deduct quantity from the chosen location only.  
**Price alerts** can fire when purchase price moves past the business threshold.  
**Shopify** is optional: connect a store and sync products into **Online** stock (no App Store install required in the current design).  
**WhatsApp** is also used for optional Q&A / reports to owners, not to staff for owner-only reports.

---

### How backend and data connect

**APIs (examples):**

- `/api/auth/otp` — request/verify OTP  
- `/api/business` — business setup and settings  
- `/api/stock` — products, sales, people actions (role-checked); can trigger WhatsApp where designed  
- `/api/system-status` — owner health panel  
- `/api/shopify` — connect / sync  
- `/api/twilio/webhook` — incoming WhatsApp  
- `/api/cron/daily-backup` — stamped backup to Blob + history row  
- `/api/cron/monthly-chart` — monthly chart jobs  
- `/api/health` — health check  

**Data layer (runtime flow documented in architecture flowchart):**

- App APIs talk to **SQLite via libSQL** (local file; optional Turso).  
- **Vercel Blob** holds DB flush and JSON backups; durable sync on Vercel.  
- **Twilio WhatsApp** for OTP and optional messaging.  
- Backup History stores success/failed, timestamp, path, error.  

Handoff documentation also describes **Firebase** as the chosen database direction (why Firestore, models, access, Storage/Blob) without requiring migration steps in every prompt unless asked.

---

### Architecture flow (must not skip)

Entry: Landing `/` → Sign in → Login `/login`  

Auth: Request code (max 3 / 10 min) → Verify 6-digit → Session 30 days → (optional) Setup business name  

Roles: equal/co-owner → `/dashboard` · staff add → `/add-product` · staff view → `/items`  

Owner app: Dashboard · Owners & Staff · Settings · Price charts  

Settings: System Status · Back up now · Backup History · Shopify  

Backend: `app/api/*`, `/api/stock`, `/api/business`, `/api/auth/otp`, `/api/system-status`, `/api/cron/daily-backup`, `/api/cron/monthly-chart`  

Data: SQLite/libSQL · Vercel Blob · Twilio WhatsApp  

---

### Brand and tone

- Calm, clear, shop-owner friendly — not enterprise jargon.  
- Cream background, navy text/buttons, gold accent.  
- Brand name **StockPulse** is a hero-level signal on the landing.  
- Support English and Urdu copy through i18n keys.  

---

### Documentation pack (for humans / “sir”)

Order: Master Requirements → PRD → TRD → Flow diagram → Brand kit → Schema → Testing.  
Testing practice: unit tests where useful, **parallel testing**, and **verification & validation every day**.  
Paid WhatsApp BSP / commercial plans: deferred until decided.  
Do not commit Firebase service account JSON or secrets to Git.

---

### Rules when building or changing StockPulse

1. Keep warehouse / shop / online quantities separate.  
2. Keep WhatsApp OTP login; do not replace with Gmail for users.  
3. Enforce roles in UI Gate and APIs.  
4. Isolate businesses (no cross-tenant data).  
5. Prefer localhost for personal checking; landing at `/` when asked; do not push to Git/remote unless the owner asks.  
6. Match existing cream/navy UI and i18n patterns.  
7. If asked only for docs, do not start Firebase migration until explicitly told.

### One-sentence summary

**StockPulse is a WhatsApp-login inventory app that shows warehouse, shop, and online stock in one calm place, with owner dashboards, staff limits, price alerts, optional Shopify, backups, and a Next.js + Vercel stack.**

## END PROMPT

---

*Saved in `docs/handoff-pack/APP-MASTER-PROMPT.md` for reuse.*
