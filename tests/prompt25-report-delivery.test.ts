import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { canSendReports } from "@/lib/access";
import {
  emailDeliveryConfigured,
  normalizeReportChannel,
  resolveReportEmailRecipient,
} from "@/lib/report-delivery";

describe("Prompt 25 — choose WhatsApp or Email for today's report", () => {
  test("Settings button opens delivery choices without sending (no send on open)", () => {
    const page = readFileSync(path.join(process.cwd(), "app/settings/page.tsx"), "utf8");
    assert.match(page, /sendDailyReportTest/);
    assert.match(page, /setReportDeliveryOpen/);
    assert.match(page, /reportViaWhatsApp/);
    assert.match(page, /reportViaEmail/);
    // Opening only toggles UI — sendDailyReport is only called with an explicit channel.
    assert.match(page, /sendDailyReport\("whatsapp"\)/);
    assert.match(page, /sendDailyReport\("email"\)/);
    assert.doesNotMatch(page, /sendDailyReport\(\)/);
  });

  test("normalizeReportChannel accepts only whatsapp|email", () => {
    assert.equal(normalizeReportChannel("whatsapp"), "whatsapp");
    assert.equal(normalizeReportChannel("Email"), "email");
    assert.equal(normalizeReportChannel(""), null);
    assert.equal(normalizeReportChannel("sms"), null);
    assert.equal(normalizeReportChannel(undefined), null);
  });

  test("API requires an explicit channel before sending", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/stock/route.ts"), "utf8");
    const block = route.slice(
      route.indexOf('action === "sendDailyReport"'),
      route.indexOf('action === "updateNotificationPrefs"'),
    );
    assert.match(block, /normalizeReportChannel\(body\.channel\)/);
    assert.match(block, /Choose WhatsApp or Email/);
    assert.match(block, /recordAndSendWhatsApp/);
    assert.match(block, /sendPlainEmail/);
    // Scheduled reports live elsewhere — this block must not edit cron prefs.
    assert.doesNotMatch(block, /maySendNotification|runScheduled/);
  });

  test("email recipient and config helpers do not invent success", () => {
    assert.equal(resolveReportEmailRecipient(null), null);
    assert.equal(resolveReportEmailRecipient(""), null);
    assert.equal(resolveReportEmailRecipient("not-an-email"), null);
    assert.equal(resolveReportEmailRecipient("owner@example.com"), "owner@example.com");
    // Without env vars in the test process, email must report as not configured.
    assert.equal(emailDeliveryConfigured(), false);
  });

  test("missing email config message is explicit (no false success)", () => {
    const email = readFileSync(path.join(process.cwd(), "lib/email.ts"), "utf8");
    assert.match(email, /Email delivery is not configured yet/);
    assert.match(email, /ok: false,\s*\n\s*skipped: true/);
    assert.match(email, /return \{ ok: true, id:/);
  });

  test("busy disables delivery choices (duplicate submit guard)", () => {
    const page = readFileSync(path.join(process.cwd(), "app/settings/page.tsx"), "utf8");
    assert.match(page, /disabled=\{busy\}/);
    assert.match(page, /sendDailyReport\("whatsapp"\)/);
  });

  test("scheduled WhatsApp runner still uses buildDailyReportMessage separately", () => {
    const scheduled = readFileSync(path.join(process.cwd(), "lib/scheduled-messages.ts"), "utf8");
    assert.match(scheduled, /buildDailyReportMessage/);
    assert.match(scheduled, /daily_report/);
    assert.doesNotMatch(scheduled, /normalizeReportChannel|sendPlainEmail/);
  });

  test("report send permissions remain owner-only", () => {
    assert.equal(canSendReports("equal_owner"), true);
    assert.equal(canSendReports("co_owner"), true);
    assert.equal(canSendReports("staff_add"), false);
    assert.equal(canSendReports("staff_view"), false);
  });
});
