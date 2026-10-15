# StockPulse — feature checklist

Use this as your check report. Mark each line when you verify it in the live app.

**Live app:** https://stockpulse-five-lyart.vercel.app  
**Legend:** Done = built and working · Partial = built but needs your setup · Missing = not built yet

---

## Login & access

- [ ] WhatsApp OTP login works
- [ ] Email + password login works
- [ ] Forgot / reset password works
- [ ] Google login button present — **Partial** (needs Google OAuth keys on Vercel)
- [ ] Session stays signed in (~30 days)
- [ ] Log out works
- [ ] Log out everywhere works
- [ ] Invite-only: strangers cannot create a new account (**on** right now)
- [ ] First-time business setup blocked for strangers (invite-only)

## Roles & people

- [ ] Equal owner can manage everything including other owners
- [ ] Co-owner can run the business but cannot add/remove owners or wipe the account
- [ ] Staff roles: view / add / sell / move — each only gets their own actions
- [ ] Staff cannot open owner-only screens (dashboard stats, settings reports, etc.)
- [ ] Add / edit staff from Staff screen
- [ ] Owners and co-owners land on dashboard; staff land on their home screen

## Stock (warehouse, shop, online)

- [ ] Add product with purchase price
- [ ] Stock kept separate by place (warehouse / shop / online)
- [ ] Multiple warehouses / shops / online places can be added in Settings
- [ ] Add stock to a chosen place
- [ ] Record a sale from a chosen place
- [ ] Move stock between places
- [ ] Correct count (recount) sets an exact number
- [ ] Selling or moving more than on hand still records; shows **Needs recount** (not a minus)
- [ ] Archive / restore a product
- [ ] Pieces-per-carton: enter qty/price as piece or carton
- [ ] Voice input on name / amount fields

## Prices

- [ ] Record purchase prices over time
- [ ] Price chart / history on product prices screen
- [ ] Choose compare unit (piece or carton)
- [ ] Price jump alerts to owners (when switched on)

## Search & import

- [ ] Search products on the stock list
- [ ] Category chips / filter
- [ ] Duplicate warning when adding a product that already exists
- [ ] Soft “did you mean…?” for similar names
- [ ] CSV / Excel import (owners only): template, preview, commit
- [ ] Failed import rows can be downloaded

## WhatsApp & reports

- [ ] Ask stock questions by WhatsApp (text or voice)
- [ ] Daily report sends automatically (default ~8pm Asia/Karachi; Hobby cron once/day)
- [ ] Monthly price chart sends on last day of month
- [ ] “Send me today’s report now (test)” in Settings → Notifications
- [ ] Daily report: first line is the action; whole message ≤ 6 lines
- [ ] Notification switches: daily report, price / low-stock / recount alerts, monthly chart, Pause all
- [ ] Switches are per person and enforced on the server
- [ ] Reply **STOP** / **band karo** pauses non-essential messages
- [ ] Reply **START** resumes them
- [ ] Login codes still work while paused
- [ ] Same report/alert is not sent twice for the same period/event
- [ ] Failed WhatsApp delivery shows in System Status
- [ ] “Window closed” labeled when outside free WhatsApp window (not marked delivered)
- [ ] Change my WhatsApp number: code goes to the **new** number; old sessions end

## Shopify

- [ ] Connect Shopify shop in Settings
- [ ] Pull catalog into Online stock
- [ ] Disconnect shop

## Backups & system

- [ ] Daily automatic backup
- [ ] Manual “Back up now” in Settings
- [ ] Backup history visible
- [ ] System Status: Firebase / WhatsApp / backup / delivery summary in plain words
- [ ] Activity log records important changes (stock, settings, etc.)

## Website & install

- [ ] Public landing page loads
- [ ] Privacy and Terms pages
- [ ] Multi-language UI / landing languages
- [ ] Install StockPulse on laptop (Chrome/Edge address-bar install or menu)
- [ ] Installed app opens like a normal desktop app
- [ ] Offline page only if network is fully down (no secret caching of stock data)

## Not done yet

- [ ] **Before / After** section on the landing page (scattered “before” vs StockPulse “after” with screenshots) — **Missing**
- [ ] Google login fully working on Vercel — **Partial** until you add Client ID + Secret

---

## Quick count

| Area | Status |
| --- | --- |
| Core stock + places + prices | Done |
| Login (WhatsApp + email) | Done |
| Google login | Partial |
| Roles / staff permissions | Done |
| Search + CSV import | Done |
| Auto reports + notification controls | Done |
| Shopify | Done |
| Backups + System Status + Activity | Done |
| PWA install | Done |
| Landing Before/After | Missing |
| Public self-signup | Off (invite-only on purpose) |
