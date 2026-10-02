# StockPulse — Master Requirements Document

This is the single source of truth for the project. Every confirmed
decision goes here. Nothing gets built or changed without it being
reflected in this file first.

---

## 1. The Problem
- SMB owners running 2-3 online stores + a physical warehouse have no
  single view of stock
- Price creep from suppliers goes unnoticed until it's already cost money
- Owners don't want another dashboard to log into — they live in WhatsApp

## 2. ICP (Target Customer)
- SMB owners in Pakistan running multiple sales channels
- Currently tracking stock manually or on disconnected spreadsheets
- Have 1-3 staff needing some level of access
- Price-sensitive — can't afford global enterprise tools

## 3. Core Features (confirmed)
- One dashboard pulling stock/sales data from every store + warehouse
- Daily automatic report sent to WhatsApp
- AI flags purchase-price anomalies the moment a new price is entered
- Two-way WhatsApp Q&A (ask "biscuits ka stock kitna hai?", get an answer)
- Role-based access tied to WhatsApp number — no separate logins
- **Price comparison, this month vs last month:**
  - Daily/weekly WhatsApp text line with arrows (e.g. "📈 Biscuits: PKR
    145, up 12% from last purchase")
  - Weekly generated chart image (PNG), not daily — avoids message
    overload
- **Language selection:** chosen once at setup (English / Urdu / Roman
  Urdu), applies to every report, alert, and Q&A reply after that
- **Daily backups:** automatic, stored separately from the live data, so
  nothing is ever lost even if something breaks
- **Multi-tenant architecture:** one shared "skeleton" (core app/code),
  but every shop owner's data is completely private and isolated —
  Shop Owner 1's grocery items and Shop Owner 2's clothing sizes never
  mix or see each other. Each owner sets their own categories/products
  inside their own private space.

## 4. Why This Approach (differentiation)
- WhatsApp-native, not just WhatsApp-notified — two-way interaction, not
  just a push report
- Proactive AI price alerts, not something the owner has to notice
  themselves
- Built for Pakistan specifically — PKR pricing, Urdu/Roman Urdu, local
  payment methods — not a translated global tool

## 5. Competitive Landscape
- Zoho Inventory, Extensiv/Brightpearl — solid dashboards, but
  enterprise-priced (PKR 5,600-84,000+/month), English-only, not
  WhatsApp-native
- Vyapar, Syncli — WhatsApp-integrated, but built for India's
  GST/UPI ecosystem, not Pakistan's
- Gap: nobody combines WhatsApp-first interaction + proactive AI price
  alerts + Pakistan-specific setup in one product

## 6. Pricing Model
- Starter tier (1 store/warehouse): **PKR 2,000/month**
- Growth tier (2-3 stores + staff access): **PKR 3,500/month**
- Cost per customer (Meta WhatsApp fees): ~PKR 200/month
- Shared BSP platform fee: ~PKR 14,000/month (spread across all
  customers — shrinks per-customer as you scale)
- **Note:** pricing needs validation with real shop owners before being
  treated as final

## 7. Investment & Revenue Projections
**To build/run the pilot (rough, one-time + first couple months):**
- Cursor subscription: ~PKR 5,600/month
- Domain: ~PKR 3,000-6,000/year
- Hosting: ~PKR 2,000-5,000/month
- WhatsApp costs during pilot: **PKR 0** (using Twilio free sandbox)
- Total to get pilot running: **~PKR 10,000-15,000**

**Once live with paying customers (monthly, ongoing):**
- Fixed cost floor: ~PKR 20,000-25,000/month (BSP + hosting)
- Plus ~PKR 200/customer/month in messaging fees

**Projected profit (estimates only, not guarantees):**
| Customers | Revenue/mo | Costs/mo | Profit/mo |
|---|---|---|---|
| 20 | PKR 55,000 | ~PKR 23,000 | ~PKR 32,000 |
| 50 | PKR 137,500 | ~PKR 38,000 | ~PKR 99,500 |
| 100 | PKR 275,000 | ~PKR 65,000 | ~PKR 210,000 |

## 8. WhatsApp BSP Choice
- **Pilot phase:** Twilio — free sandbox testing, pay-as-you-go, fits a
  developer-led build with zero upfront WhatsApp cost
- **Post-pilot / going live in Pakistan:** switch to WeTarseel — PKR-native
  billing, local support, ~PKR 14,000/month platform fee
- Important: from **October 1, 2026**, WhatsApp Service message replies
  in Pakistan stop being free ($0.015/message) — factor this into live
  costs, not pilot costs (sandbox testing isn't affected)

## 9. Demo/Pilot Build Scope
**In scope for the demo (5-10 real shop owners testing it):**
- Manual stock/price entry for one store/warehouse per owner
- Daily WhatsApp report, auto-sent
- Price-anomaly alert on new price entry
- Basic WhatsApp Q&A (can be semi-manual behind the scenes at first)
- Simple database (Google Sheet or SQLite) — not a big production DB
- Twilio free sandbox for WhatsApp testing

**Explicitly OUT of scope for the demo (save for later):**
- Multi-channel API integrations (real Shopify/store syncing)
- Voice-note stock entry
- Supplier comparison
- Shrinkage/mismatch detection

## 10. Open Items (not decided yet)
- Final pricing, to be validated with the 5-10 pilot owners
- Which 5-10 real shop owners will test it, and when
- Exact demo screen layout/flow (next step)

---

*Last updated: this conversation. Add to this file — don't replace
sections without carrying forward what's already confirmed.*
