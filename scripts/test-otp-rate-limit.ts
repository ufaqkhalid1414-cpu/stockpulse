import { ensureDbReady, getDb } from "@/lib/db";
import { createOtp } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";

const phone = "+92 300 9998811";

async function main() {
  process.env.OTP_DEV_MODE = "1";
  await ensureDbReady();
  const normalized = normalizePhone(phone);
  await getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  await getDb().prepare("DELETE FROM otp_requests WHERE phone = ?").run(normalized);

  for (let i = 1; i <= 3; i++) {
    // Clear cooldown (otp_codes) while keeping otp_requests rate-limit window.
    await getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
    const result = await createOtp(phone);
    console.log(`request ${i}: ok`);
    void result;
  }

  await getDb().prepare("DELETE FROM otp_codes WHERE phone = ?").run(normalized);
  try {
    await createOtp(phone);
    console.error("FAIL: 4th request should have been rate-limited");
    process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/too many/i.test(message)) {
      console.error("FAIL: unexpected error", message);
      process.exit(1);
    }
    console.log("request 4: blocked —", message);
    console.log("OTP rate-limit OK");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
