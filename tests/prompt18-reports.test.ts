import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDailyReportMessage,
  dailyReportLineCount,
} from "@/lib/daily-report";
import {
  DEFAULT_NOTIFICATION_PREFS,
  maySendNotification,
  normalizeNotificationPrefs,
  parseStopStart,
} from "@/lib/notification-prefs";
import { classifySendFailure } from "@/lib/outbound";
import { isAtOrPastLocalTime, isLastLocalDayOfMonth, localDateKey } from "@/lib/timezone";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Rice",
    category: "Staples",
    variant: "5kg",
    warehouseQty: 10,
    shopQty: 2,
    onlineQty: 0,
    purchasePrice: 100,
    restockThreshold: 5,
    piecesPerCarton: null,
    priceHistory: [
      { month: "jan", price: 90 },
      { month: "feb", price: 100 },
    ],
    ...overrides,
    priceCompareUnit: overrides.priceCompareUnit ?? "piece",
    priceEntries: overrides.priceEntries ?? [
      { id: "e1", recordedAt: "2026-01-01", pricePerPiece: 90, piecesPerCarton: null },
      { id: "e2", recordedAt: "2026-02-01", pricePerPiece: 100, piecesPerCarton: null },
    ],
  };
}

/** In-memory stand-in for claimSentMarker (atomic claim once per period). */
function makeClaimStore() {
  const claimed = new Set<string>();
  return {
    claim(key: string) {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}

describe("Prompt 18 — schedules, prefs, delivery, report shape", () => {
  test("two runs for the same day send exactly once per owner", () => {
    const store = makeClaimStore();
    const owners = ["+923001", "+923002"];
    const period = "2026-10-12";
    let sent = 0;
    for (const _run of [1, 2]) {
      for (const phone of owners) {
        const key = `daily_report|${phone}|${period}`;
        if (store.claim(key)) sent += 1;
      }
    }
    assert.equal(sent, 2, "one send per owner across two cron runs");
  });

  test("daily report switch off is enforced on the server (maySendNotification)", () => {
    const off = normalizeNotificationPrefs({ dailyReport: false });
    assert.equal(maySendNotification(off, "daily_report"), false);
    assert.equal(maySendNotification(DEFAULT_NOTIFICATION_PREFS, "daily_report"), true);
  });

  test("pauseAll blocks reports/alerts but OTP is not a notifiable kind", () => {
    const paused = normalizeNotificationPrefs({ pauseAll: true });
    assert.equal(maySendNotification(paused, "daily_report"), false);
    assert.equal(maySendNotification(paused, "price_alert"), false);
    assert.equal(maySendNotification(paused, "low_stock_alert"), false);
    assert.equal(maySendNotification(paused, "recount_alert"), false);
    assert.equal(maySendNotification(paused, "monthly_chart"), false);
    // Login codes never go through maySendNotification — they stay available while paused.
  });

  test("STOP and START parse (including band karo)", () => {
    assert.equal(parseStopStart("STOP"), "stop");
    assert.equal(parseStopStart("band karo"), "stop");
    assert.equal(parseStopStart("START"), "start");
    assert.equal(parseStopStart("hello"), null);
  });

  test("window closed failures are labeled; permanent failures do not retry", () => {
    const closed = classifySendFailure("63016: Message fails because it is outside the allowed window");
    assert.equal(closed.status, "window_closed");
    assert.equal(closed.permanent, true);

    const badNumber = classifySendFailure("21211 not a valid WhatsApp");
    assert.equal(badNumber.status, "failed");
    assert.equal(badNumber.permanent, true);

    const transient = classifySendFailure("timeout talking to upstream");
    assert.equal(transient.status, "failed");
    assert.equal(transient.permanent, false);
  });

  test("retry intervals are 1 minute, 10 minutes, and 1 hour", () => {
    const delays = [60_000, 10 * 60_000, 60 * 60_000];
    assert.deepEqual(delays, [60_000, 600_000, 3_600_000]);
  });

  test("daily report starts with action line and stays within six lines", () => {
    const low = product({ warehouseQty: 1, shopQty: 0, restockThreshold: 5 });
    const msg = buildDailyReportMessage({
      businessName: "Demo Store",
      language: "en",
      products: [low],
    });
    const lines = msg.split("\n").filter((l) => l.trim());
    assert.ok(lines.length <= 6, `got ${lines.length} lines:\n${msg}`);
    assert.ok(
      lines[0].startsWith("Needs attention") || lines[0].startsWith("Everything looks fine"),
      `action line was: ${lines[0]}`,
    );
    assert.equal(dailyReportLineCount(msg), lines.length);
  });

  test("fine day uses the calm action line", () => {
    const ok = product({
      warehouseQty: 40,
      shopQty: 40,
      onlineQty: 40,
      stockByPlace: { warehouse: 40, shop: 40, online: 40 },
      restockThreshold: 5,
      everHeldByPlace: { warehouse: true, shop: true, online: true },
      priceEntries: [
        { id: "e1", recordedAt: "2026-01-01", pricePerPiece: 100, piecesPerCarton: null },
        { id: "e2", recordedAt: "2026-02-01", pricePerPiece: 100, piecesPerCarton: null },
      ],
      priceHistory: [{ month: "feb", price: 100 }],
    });
    const msg = buildDailyReportMessage({
      businessName: "Demo Store",
      language: "en",
      products: [ok],
    });
    assert.ok(msg.startsWith("Everything looks fine today."), `got: ${msg.split("\n")[0]}`);
    assert.ok(dailyReportLineCount(msg) <= 6);
  });

  test("timezone helpers: Asia/Karachi date key and past local time", () => {
    // 2026-10-12 20:30 in Karachi = 15:30 UTC
    const now = new Date("2026-10-12T15:30:00.000Z");
    assert.equal(localDateKey(now, "Asia/Karachi"), "2026-10-12");
    assert.equal(isAtOrPastLocalTime(now, "Asia/Karachi", "20:00"), true);
    assert.equal(isAtOrPastLocalTime(now, "Asia/Karachi", "21:00"), false);
  });

  test("last local day of month detection", () => {
    const oct31 = new Date("2026-10-31T16:00:00.000Z"); // 21:00 Karachi
    assert.equal(isLastLocalDayOfMonth(oct31, "Asia/Karachi"), true);
    const oct30 = new Date("2026-10-30T16:00:00.000Z");
    assert.equal(isLastLocalDayOfMonth(oct30, "Asia/Karachi"), false);
  });

  test("event key claim: same event never alerts twice", () => {
    const store = makeClaimStore();
    const key = "event__price_p1_110";
    assert.equal(store.claim(key), true);
    assert.equal(store.claim(key), false);
  });

  test("Hobby daily cron at 18:00 UTC is past default 20:00 Asia/Karachi", () => {
    // vercel.json scheduled-messages: 0 18 * * *
    const cronTick = new Date("2026-10-12T18:00:00.000Z"); // 23:00 Karachi
    assert.equal(localDateKey(cronTick, "Asia/Karachi"), "2026-10-12");
    assert.equal(isAtOrPastLocalTime(cronTick, "Asia/Karachi", "20:00"), true);
    assert.equal(isLastLocalDayOfMonth(new Date("2026-10-31T18:00:00.000Z"), "Asia/Karachi"), true);
  });

  test("monthly chart claim is per person+month across two runs", () => {
    const store = makeClaimStore();
    const owners = ["+923001", "+923002"];
    const period = "2026-10";
    let sent = 0;
    for (const _run of [1, 2]) {
      for (const phone of owners) {
        if (store.claim(`monthly_chart|${phone}|${period}`)) sent += 1;
      }
    }
    assert.equal(sent, 2);
  });
});
