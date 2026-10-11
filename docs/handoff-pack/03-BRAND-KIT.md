---
stylesheet: ./pdf-style.css
pdf_options:
  format: A4
  margin: 18mm 16mm 18mm 16mm
---

# StockPulse — Design Brief / Brand Kit

**Note:** There is **no fixed official logo or locked brand book** yet. This PDF records **what the app uses today**. If you ask for brand changes later, this document will be updated to match.

---

## 1. Product name

**StockPulse** — shown in the app header and on login / setup screens as a small brand label above the business name.

There is no separate logo image file in the project yet. The brand signal is the **wordmark “StockPulse”** in navy type on a cream background.

---

## 2. Color palette (current)

| Token | Hex | Role in the UI |
|-------|-----|----------------|
| **Cream** | `#FAF6EE` | Page background, soft panels |
| **Navy** | `#2D3B5E` | Primary text, primary buttons, headings |
| **Gold** | `#D9A947` | Soft highlights / status borders |
| **Sage** | `#EDF3E7` | Soft green tint (supporting) |
| **Pine** | `#1E4630` | Success / positive price change |
| **Clay** | `#B4552E` | Errors / alerts / negative price change |
| **White** | `#FFFFFF` | Cards, inputs, secondary surfaces |

Primary button style: **navy background + cream text**.  
Secondary: white with navy border/text.

---

## 3. Typography

| Item | Current choice |
|------|----------------|
| Primary UI font | **DM Sans** (loaded as `--font-dm` in the app layout) |
| Fallbacks | Segoe UI, Tahoma, Nirmala UI, system sans |
| Body text | Medium weight navy / navy at reduced opacity |
| Page titles | Bold, about **2xl–4xl** on large screens |
| Section headings | Bold, about **lg** (`text-lg font-bold`) |
| Labels | Medium, slightly muted navy |
| Numbers (qty / money) | Bold, large tracking-tight figures |

All UI copy supports the app languages already in the product (English and others via i18n); this brand kit itself is written in **English**.

---

## 4. Headings and titles (pattern)

| Level | How it appears in the app |
|-------|---------------------------|
| App / screen title | Large bold navy (`h1` style via shared UI) |
| Section title | Smaller bold navy (`h2` / `text-lg font-bold`) |
| Support line | Regular muted navy under the title |
| Nav labels | Medium / semibold depending on active state |

**Documentation PDFs in this pack** use a fixed scale: main headings **20pt**, subheadings **18pt**, body **11pt**.

---

## 5. Layout and UI feel

- Soft **cream** full-page background (not flat pure white).  
- White content cards with light shadow (“depth” / lift on press).  
- **Rounded** controls (pills for buttons, ~14px card radius).  
- Sticky header with cream/blur and business name.  
- Mobile-first spacing; large readable stock numbers on dashboard.

---

## 6. Logo / brand assets (status)

| Asset | Status |
|-------|--------|
| Official logo SVG/PNG | Not fixed yet |
| Wordmark “StockPulse” | In use in UI |
| Favicon / PWA theme | Theme color cream `#FAF6EE` |

When a logo file and rules are decided, add them here and regenerate this PDF.

---

## 7. Do / don’t (for future edits)

- Keep navy + cream as the main identity unless you request a change.  
- Prefer pine for “good” and clay for “bad/alert,” not random reds/greens.  
- Do not introduce a second unrelated color system without updating this kit.
