# Prompt 18 — Automatic Reports (verification)

## Audit (what existed before)

| Piece | Before Prompt 18 |
| --- | --- |
| Daily report | Manual only — Settings “Send daily WhatsApp report” → `sendDailyReport` on `/api/stock` |
| Monthly chart | Cron route `/api/cron/monthly-chart` + manual send button |
| Scheduler for daily | None |
| Timezone on business | Not stored (UTC assumptions) |
| Per-owner notification switches | Missing |
| STOP / START | Missing |
| Delivery status callbacks | Missing |
| Sent markers / event keys | Missing |

## What changed

- **Cron:** `/api/cron/scheduled-messages` every **15 minutes** (`vercel.json`). Late ticks are fine — `sentMarkers` claim once per business+person+type+period.
- **Daily report:** each owner’s chosen local time (default **20:00**), business timezone default **Asia/Karachi**.
- **Monthly chart:** last local calendar day at/after **20:00**; still also registered on the month-end UTC cron.
- **Settings → Notifications:** switches (Daily report + time, Price / Low-stock / Recount alerts, Monthly chart, Pause all), test “Send me today’s report now”, change-my-number with OTP to the **new** number (ends sessions).
- **WhatsApp STOP / “band karo”:** pause all non-essential; **START** resumes. Login OTP never gated by prefs.
- **Outbound tracking:** `outboundMessages` + `/api/twilio/status` (signature verified). Retries at 1m / 10m / 1h (max 3). Window-closed labeled, not marked delivered.
- **System Status:** plain “WhatsApp messages today: X sent, Y failed” + “Window closed” / “WhatsApp is not delivering…”.

## Scheduler limits (Vercel)

| Limit | Effect |
| --- | --- |
| Cron schedule `*/15 * * * *` | Timing precision about **±15 minutes** after the chosen local time |
| Hobby vs Pro | Hobby historically limited cron frequency (often **1×/day**); Pro supports frequent intervals. Deploy on a plan that allows `*/15`, or keep the same handler and run it as often as the plan allows — late runs still claim correctly |
| `maxDuration` 60s | Cap on work per tick |

## Tests run

See `tests/prompt18-reports.test.ts` — duplicate claim, prefs enforcement, STOP/START, window_closed, report ≤6 lines with action first, timezone helpers.

## Verification checklist

1. **Automatic send without a button** — cron path + `runScheduledMessages`; limits documented above.
2. **Two runs / one period → one send** — `claimSentMarker` + test “two runs…exactly once”.
3. **Switches per person, server-enforced** — `maySendNotification` + `updateNotificationPrefs` before send.
4. **STOP / START; login codes unaffected** — webhook + OTP path never calls `maySendNotification`.
5. **Failed / window closed in System Status** — `outboundStatsToday` + delivery summary.
6. **Report action-first, ≤6 lines** — `buildDailyReportMessage`.
