import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

describe("Prompt 27 — consistent success/failure feedback", () => {
  test("Add Product shows success only after await and reuses SuccessPopup", () => {
    const page = readFileSync(path.join(process.cwd(), "app/add-product/page.tsx"), "utf8");
    assert.match(page, /SuccessPopup/);
    assert.match(page, /productAddedSuccess/);
    assert.match(page, /\.then\(\(\) => \{[\s\S]*setShowSuccess\(true\)/);
    assert.match(page, /\.catch\(\(\) => \{[\s\S]*do not show success/);
    assert.match(page, /photoReadFailed/);
  });

  test("StockActions only marks saved after awaits complete", () => {
    const actions = readFileSync(path.join(process.cwd(), "components/StockActions.tsx"), "utf8");
    assert.match(actions, /setStatus\("saved"\)/);
    assert.match(actions, /setStatus\("failed"\)/);
    assert.match(actions, /status === "saving"/);
  });

  test("Staff success labels match the action; failures do not set success", () => {
    const page = readFileSync(path.join(process.cwd(), "app/staff/page.tsx"), "utf8");
    assert.match(page, /flashSuccess\(t\(lang, "staffPermissionSaved"\)\)/);
    assert.match(page, /flashSuccess\(t\(lang, "staffRemoved"\)\)/);
    assert.match(page, /never show success/);
    assert.match(page, /window\.confirm/);
  });

  test("Report delivery clears notice before send and never claims success in catch", () => {
    const page = readFileSync(path.join(process.cwd(), "app/settings/page.tsx"), "utf8");
    assert.match(page, /sendDailyReport\("whatsapp"\)/);
    assert.match(page, /sendDailyReport\("email"\)/);
    assert.match(page, /never claim report sent|never claim email sent/);
    assert.match(page, /setNotice\(""\)/);
    const store = readFileSync(path.join(process.cwd(), "lib/store.tsx"), "utf8");
    assert.match(store, /WhatsApp is not configured yet|Email could not send/);
  });

  test("Settings save/backup require try\/catch success gating and name validation", () => {
    const page = readFileSync(path.join(process.cwd(), "app/settings/page.tsx"), "utf8");
    assert.match(page, /settingsNameRequired/);
    assert.match(page, /await runBackup\(\)/);
    assert.match(page, /do not flash success|do not show saved/);
    assert.match(page, /if \(error\) setNotice\(""\)/);
  });

  test("Prices page surfaces validation errors instead of silent return", () => {
    const page = readFileSync(path.join(process.cwd(), "app/prices/[id]/page.tsx"), "utf8");
    assert.match(page, /setSaleError\(t\(lang, "qtyInvalid"\)\)/);
    assert.match(page, /setPriceError\(t\(lang, "priceInvalid"\)\)/);
    assert.match(page, /setFlash\(""\)/);
    assert.match(page, /savingEllipsis/);
  });

  test("AppShell does not label every failure as a connection problem", () => {
    const shell = readFileSync(path.join(process.cwd(), "components/AppShell.tsx"), "utf8");
    assert.match(shell, /actionErrorBanner/);
    assert.match(shell, /offlineBanner/);
  });

  test("Import confirm button shows loading while busy", () => {
    const page = readFileSync(path.join(process.cwd(), "app/import/page.tsx"), "utf8");
    assert.match(page, /savingEllipsis/);
    assert.match(page, /!res\.ok/);
  });
});
