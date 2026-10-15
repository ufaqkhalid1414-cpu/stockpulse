import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

describe("Public signup UI wiring", () => {
  test("AuthEntry shows create-account path when NEXT_PUBLIC_PUBLIC_SIGNUP is on", () => {
    const auth = readFileSync(path.join(process.cwd(), "components/AuthEntry.tsx"), "utf8");
    assert.match(auth, /NEXT_PUBLIC_PUBLIC_SIGNUP === "1"/);
    assert.match(auth, /setView\("signup"\)/);
    assert.match(auth, /loginOpenSignupNotice/);
    assert.match(auth, /loginNeedAccount/);
    assert.match(auth, /loginHaveAccount/);
  });

  test("server gates still key off PUBLIC_SIGNUP", () => {
    const access = readFileSync(path.join(process.cwd(), "lib/public-access.ts"), "utf8");
    assert.match(access, /PUBLIC_SIGNUP === "1"/);
  });
});
