# Prompt 20 — Low stock per place

## Audit
- Instant low-stock alert existed but used **total** qty + one `lowStockAlerted` flag.
- Moves did not alert or re-arm.
- `restockThreshold` (default 5) already on Add/Edit product.

## Change
- Each place checked separately with **at or below**.
- Crossing alerts only; silence until place rises above the number again.
- Moves can alert (source) and re-arm (destination).
- Recount alert wins if the same action needs both.
- Low Stock screen lists held places with ⚠️ on low ones; never-held places hidden.
- Dashboard tile = products with ≥1 low place.
- Owners/co-owners only; respects Low-stock alerts switch.

## Tests
`tests/prompt20-low-stock.test.ts` — full suite **424 pass / 0 fail**.
