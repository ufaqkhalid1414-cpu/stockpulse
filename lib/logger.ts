/**
 * Minimal structured logging. Writes JSON-ish single-line records to
 * console (stdout/stderr) so they are grep-able in Vercel/CLI logs.
 *
 * Hard rule: NEVER pass an OTP code or session token in `fields`. Callers
 * are responsible for omitting those; this module does not attempt to guess
 * which keys are sensitive beyond the common names below, which it strips
 * defensively as a last resort.
 *
 * Optional Sentry hook: if `SENTRY_DSN` is unset (the default for this repo),
 * `logError` is a pure console no-op beyond printing. If `SENTRY_DSN` is set
 * and `@sentry/node` happens to be installed, we forward errors to it; if not
 * installed, this is a silent no-op — never throws, never blocks the request.
 */

const REDACT_KEYS = new Set(["code", "otp", "otpCode", "token", "sessionToken", "tokenHash", "codeHash"]);

type Fields = Record<string, unknown> | undefined;

function safeFields(fields: Fields): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function line(level: "info" | "warn" | "error", event: string, fields: Fields) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...safeFields(fields),
  });
}

export function logInfo(event: string, fields?: Record<string, unknown>) {
  console.log(line("info", event, fields));
}

export function logWarn(event: string, fields?: Record<string, unknown>) {
  console.warn(line("warn", event, fields));
}

export function logError(event: string, fields?: Record<string, unknown>, err?: unknown) {
  const errFields = err
    ? {
        errorMessage: err instanceof Error ? err.message : String(err),
        ...(err instanceof Error && err.stack ? { errorStack: err.stack } : {}),
      }
    : {};
  console.error(line("error", event, { ...fields, ...errFields }));
  void forwardToSentryIfConfigured(event, fields, err);
}

/**
 * Optional Sentry hook. `@sentry/node` is NOT a dependency of this repo —
 * this stays a no-op unless both `SENTRY_DSN` is set AND the package has
 * been installed separately. The module specifier is built from a variable
 * (not a string literal) so TypeScript/bundlers never try to resolve
 * `@sentry/node` at build time when it isn't installed.
 */
async function forwardToSentryIfConfigured(event: string, fields: Fields, err: unknown) {
  if (!process.env.SENTRY_DSN) return;
  try {
    const sentryModuleName = "@sentry/node";
    const mod: unknown = await import(sentryModuleName).catch(() => null);
    if (!mod || typeof mod !== "object") return;
    const sentry = mod as { captureException?: (e: unknown, ctx?: unknown) => void };
    if (typeof sentry.captureException !== "function") return;
    sentry.captureException(err instanceof Error ? err : new Error(event), {
      extra: { event, ...safeFields(fields) },
    });
  } catch {
    // Never let logging failures break the request.
  }
}
