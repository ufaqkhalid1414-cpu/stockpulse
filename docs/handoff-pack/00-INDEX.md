---
stylesheet: ./pdf-style.css
pdf_options:
  format: A4
  margin: 18mm 16mm 18mm 16mm
---

# StockPulse — Documentation Pack

This folder is the **written documentation** for StockPulse (inventory idea). Language: **English only**.

## Documents (replace set)

| # | File | What it is |
|---|------|------------|
| 1 | `StockPulse_Master_Requirements .pdf` | Master Requirements Document |
| 2 | `StockPulse_PRD (1).pdf` | Product Requirements Document (PRD) |
| 3 | `01-TRD.pdf` | Technical Requirements Document (stack, login/logging, hosting, Git, Firebase as database) |
| 4 | `02-FLOW-DIAGRAM.pdf` | Real flowchart / flow diagram (shapes: Start oval, process boxes, Yes/No diamonds) |
| 5 | `03-BRAND-KIT.pdf` | Current brand look: colors, typography, headings (no fixed logo yet) |
| 6 | `04-SCHEMA.pdf` | Database (Firebase), data models, access control, storage / Blob |
| 7 | `05-TESTING.pdf` | Unit testing, parallel testing, verification & validation |

**Skipped for now (by request):** Email (Resend), DNS / domain, paid-plans PDF, Gmail auth, clipping/transcribe modules.

**Not in this pack as a migration how-to:** SQLite → Firebase step-by-step. Database document describes **Firebase** as the chosen database.

## Regenerate PDFs

From project root:

```bash
node docs/handoff-pack/build-pdfs.mjs
```
