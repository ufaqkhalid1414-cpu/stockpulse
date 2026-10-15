# Prompt 18 — Automatic Reports (verification)

## Audit (what existed / what we keep)

| Piece | Status |
| --- | --- |
| Daily report content (action first, ≤6 lines) | Built — `lib/daily-report.ts` |
| Per-owner notification switches + Settings UI | Built — Settings → Notifications |
| STOP / START on WhatsApp | Built — Twilio webhook |
| Change my number (OTP to new number, revoke sessions) | Built |
| Outbound delivery + status callbacks + retries | Built — `lib/outbound.ts` |
| Sent markers + event keys | Built — `lib/sent-markers.ts` |
| Scheduler logic | Built — `lib/scheduled-messages.ts` |
| Production cron timing | **Fixed this pass** — was `0 8 * * *` (13:00 Karachi), which never reached default 20:00 |

## Scheduler (current)

| Cron | Schedule | Meaning |
| --- | --- | --- |
| `/api/cron/scheduled-messages` | `0 18 * * *` | Once daily **18:00 UTC ≈ 23:00 Asia/Karachi**. Finds owners whose local time has passed (default **20:00**) and sends once. |
| `/api/cron/monthly-chart` | `5 18 28-31 * *` | Month-end backup; same handler (local last day + 20:00 + per-person markers). |

### Vercel plan limits

| Limit | Effect |
| --- | --- |
| **Hobby** | Cron typically **once per day** (not every 15 minutes). Timing precision is about the daily fire time, not ±15 min. |
| **Pro** | Can use `*/15 * * * *` for ±15 minute precision after each owner’s chosen time. |
| Late runs | Fine — `claimSentMarker` wins once per business+person+type+period. |
| `maxDuration` 60s | Cap on work per tick. |
| Custom times after ~23:00 Karachi | On Hobby’s single daily tick, those may not fire until you move to Pro/`*/15` or a later UTC hour. Default **20:00** is covered. |

## Monthly charts

Per-person `monthly_chart` markers for `YYYY-MM`. Only claimed phones receive charts for that business.

## Tests

`tests/prompt18-reports.test.ts` — duplicate claim, prefs, STOP/START, window_closed, report ≤6 lines, Karachi helpers, Hobby cron vs 20:00, monthly per-person claim.

## Verification checklist

1. Daily + monthly send without a button — cron + `runScheduledMessages`; limits above.
2. Two runs / one period → one send — markers + tests.
3. Switches per person, server-enforced — `maySendNotification`.
4. STOP / START; login codes unaffected — webhook; OTP never gated by prefs.
5. Failed / window closed in System Status — outbound + Settings panel.
6. Report action-first, ≤6 lines — `buildDailyReportMessage`.
