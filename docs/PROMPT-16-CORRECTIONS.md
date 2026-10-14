# Prompt 16 — Three Corrections (A + B implemented; C skipped)

## Scope decision
- **Part A** — Sale always records; Needs recount — **implemented**
- **Part B** — Price comparison by stock entry in chosen unit — **implemented**
- **Part C** — Staff cannot record sales — **NOT implemented** (explicit owner request: keep Record Sale for staff)

## Part A — what changed
- Sales/moves always record in full; internal qty may go negative.
- UI/reports show `0` + "Needs recount" (never a minus).
- One owner WhatsApp alert per product+location until Correct count re-arms.
- Dashboard status counts items needing recount.
- Activity tags sales/moves with "needed recount".
- Correct count clears the flag and cannot set a negative.

## Part B — what changed
- Per-product `priceCompareUnit` (piece/carton), saved by owners.
- `priceEntries` drive chart (last 6 entries, newest gold) and entry list.
- History rows store `pricePerPiece` + `piecesPerCarton` with each entry.
- Alerts worded in the chosen unit.

## Tests
`npm test` — **239 pass / 0 fail** (includes `tests/prompt16-part-a.test.ts`, `tests/price-display.test.ts`).
