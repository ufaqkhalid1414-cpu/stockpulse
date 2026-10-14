# Prompt 17 — Search, Duplicate Detection, CSV/Excel Import

## Audit
- No prior search box or import existed on `/items` / ProductList.
- Improved by adding client-side search + new import flow (not replacing anything).

## Built
1. **Search** on stock list (owners + staff): VoiceInput, category chips, pages of 50, Needs recount badges preserved.
2. **Duplicate detection** on Add Product: live matches, exact-dupe dialog, soft “Did you mean…?”
3. **Import** (`/import`, owners only): template CSV, preview, skip/add existing, batch commit, failed-rows download, import key anti-dupe, Activity log entry. Staff → 403.

## Tests
`npm test` — **251 pass / 0 fail** (`tests/product-search.test.ts`, `tests/product-import.test.ts`).
