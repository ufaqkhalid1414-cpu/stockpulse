"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { InstallStockPulse } from "@/components/InstallStockPulse";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button, Field } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

type AuthView = "chooser" | "whatsapp" | "email-login" | "signup" | "forgot" | "reset";

/** Module-level so typing does not remount inputs (nested components remount every keystroke). */
function AuthEntryShell({
  title,
  body,
  children,
  alertError,
  backLabel,
  onBack,
}: {
  title: string;
  body?: string;
  children: React.ReactNode;
  alertError?: string | null;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-semibold text-navy/55">
            StockPulse
          </Link>
          <span className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
        </div>
        <LanguageMenu align="end" />
      </div>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-navy sm:text-4xl">{title}</h1>
      {body ? <p className="mt-3 text-base leading-relaxed text-navy/70">{body}</p> : null}
      {children}
      {alertError ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {alertError}
        </p>
      ) : null}
      {onBack && backLabel ? (
        <button
          type="button"
          className="mt-6 text-sm font-semibold text-navy/65 underline-offset-4 hover:underline"
          onClick={onBack}
        >
          {backLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Multi-method login + first-time business setup. */
export function AuthEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    state,
    authenticated,
    needsSetup,
    phone: sessionPhone,
    email: sessionEmail,
    startFresh,
    startSample,
    logout,
    requestOtp,
    verifyOtp,
    busy,
    error: storeError,
    refresh,
  } = useStock();
  const lang = state.language;
  const signupOpen = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP === "1";

  const [view, setView] = useState<AuthView>("chooser");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [waStep, setWaStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [localError, setLocalError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "google_not_configured") {
      setLocalError(t(lang, "loginGoogleNotConfigured"));
    } else if (err === "invite_only") {
      setLocalError(t(lang, "loginGoogleInviteOnly"));
    } else if (err === "google_denied" || err === "google_failed") {
      setLocalError(t(lang, "loginGoogleFailed"));
    }
    const token = searchParams.get("reset");
    if (token) {
      setResetToken(token);
      setView("reset");
    }
  }, [searchParams, lang]);

  useEffect(() => {
    fetch("/api/auth/google", { method: "POST" })
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => setGoogleConfigured(Boolean(data.configured)))
      .catch(() => setGoogleConfigured(false));
  }, []);

  async function sendCode() {
    setLocalError("");
    setHint("");
    setDevCode(null);
    try {
      const result = await requestOtp(phone);
      setWaStep("code");
      if (result.devCode) {
        setDevCode(result.devCode);
        setHint(result.warning || t(lang, "otpDevHint"));
      } else {
        setHint(t(lang, "otpSentHint"));
      }
    } catch {
      /* store error */
    }
  }

  async function confirmCode() {
    setLocalError("");
    try {
      await verifyOtp(phone, code.trim());
    } catch {
      /* store error */
    }
  }

  async function emailAction(action: "signup" | "login" | "forgot" | "reset") {
    setLocalError("");
    setHint("");
    setLocalBusy(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email,
          password,
          name,
          token: resetToken,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        warning?: string;
        resetToken?: string;
        needsSetup?: boolean;
        homePath?: string;
      };
      if (!res.ok) {
        const msg = data.error || "Request failed";
        // Invite-only often looks like “email doesn’t work” when no email account exists yet.
        throw new Error(msg);
      }
      if (action === "forgot") {
        if (data.resetToken) {
          setResetToken(data.resetToken);
          setView("reset");
          setHint(data.warning || t(lang, "loginResetDevHint"));
        } else {
          setHint(data.warning || t(lang, "loginForgotSent"));
        }
        return;
      }
      await refresh();
      if (data.needsSetup === false && data.homePath) {
        router.replace(data.homePath);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLocalBusy(false);
    }
  }

  async function startReal() {
    const trimmed = businessName.trim();
    if (!trimmed) {
      setSetupError(t(lang, "nameRequired"));
      return;
    }
    await startFresh(trimmed);
  }

  async function startWithSample() {
    await startSample(businessName.trim() || "General Store");
  }

  const working = busy || localBusy;
  const alertError = localError || storeError;

  function backToChooser() {
    setView("chooser");
    setLocalError("");
    setHint("");
    setWaStep("phone");
    setCode("");
    setDevCode(null);
  }

  const shellBack = {
    backLabel: t(lang, "loginBackMethods"),
    onBack: backToChooser,
  };

  if (!authenticated) {
    if (view === "chooser") {
      return (
        <AuthEntryShell title={t(lang, "loginTitle")} body={t(lang, "loginBody")} alertError={alertError}>
          <div className="mt-8 space-y-3">
            <Button full disabled={working} onClick={() => setView("whatsapp")}>
              {t(lang, "loginWithWhatsapp")}
            </Button>
            {googleConfigured === false ? (
              <Button full variant="secondary" disabled>
                {t(lang, "loginWithGoogle")}
              </Button>
            ) : (
              <a
                href="/api/auth/google"
                className={`depth lift inline-flex w-full items-center justify-center rounded-full border border-navy/20 bg-white px-6 py-3 text-sm font-semibold text-navy ${
                  working || googleConfigured === null ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {t(lang, "loginWithGoogle")}
              </a>
            )}
            <Button full variant="secondary" disabled={working} onClick={() => setView("email-login")}>
              {t(lang, "loginWithEmail")}
            </Button>
            {signupOpen ? (
              <Button full variant="secondary" disabled={working} onClick={() => setView("signup")}>
                {t(lang, "loginCreateAccount")}
              </Button>
            ) : null}
          </div>
          <p className="mt-6 text-center text-sm leading-relaxed text-navy/60">
            {signupOpen ? t(lang, "loginOpenSignupNotice") : t(lang, "inviteOnlyNotice")}
          </p>
          <div className="mt-4 flex flex-col gap-3 text-center text-sm">
            {signupOpen ? (
              <button
                type="button"
                className="text-navy/60 underline-offset-4 hover:underline"
                onClick={() => setView("signup")}
              >
                {t(lang, "loginNeedAccount")}
              </button>
            ) : null}
            <button
              type="button"
              className="text-navy/60 underline-offset-4 hover:underline"
              onClick={() => setView("forgot")}
            >
              {t(lang, "loginForgotPassword")}
            </button>
          </div>
          <div className="mt-6">
            <InstallStockPulse lang={lang} />
          </div>
          {googleConfigured === false ? (
            <p className="mt-4 text-xs leading-relaxed text-navy/50">{t(lang, "loginGoogleNotConfigured")}</p>
          ) : null}
        </AuthEntryShell>
      );
    }

    if (view === "whatsapp") {
      return (
        <AuthEntryShell
          title={t(lang, "loginWhatsappTitle")}
          body={t(lang, "loginWhatsappBody")}
          alertError={alertError}
          {...shellBack}
        >
          {waStep === "phone" ? (
            <div className="card mt-8 space-y-4 p-5 sm:p-6">
              <Field id="wa-login" label={t(lang, "loginWhatsapp")}>
                <VoiceInput
                  id="wa-login"
                  lang={lang}
                  value={phone}
                  onChange={setPhone}
                  placeholder={t(lang, "whatsappPlaceholder")}
                  dir="ltr"
                  autoComplete="tel"
                />
              </Field>
              <p className="text-xs text-navy/55">{t(lang, "loginWhatsappHint")}</p>
              <Button full disabled={working} onClick={sendCode}>
                {t(lang, "sendCode")}
              </Button>
            </div>
          ) : (
            <div className="card mt-8 space-y-4 p-5 sm:p-6">
              <p className="text-sm text-navy/70">
                {t(lang, "otpSentTo")} <span dir="ltr" className="font-semibold text-navy">{phone}</span>
              </p>
              <Field id="otp-code" label={t(lang, "otpCode")}>
                <VoiceInput
                  id="otp-code"
                  lang={lang}
                  value={code}
                  onChange={setCode}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                />
              </Field>
              {devCode ? (
                <p className="rounded-xl bg-cream px-3 py-2 text-sm text-navy" role="status">
                  {t(lang, "otpDevCode")}: <strong dir="ltr">{devCode}</strong>
                </p>
              ) : null}
              {hint ? <p className="text-sm text-navy/65">{hint}</p> : null}
              <Button full disabled={working} onClick={confirmCode}>
                {t(lang, "verifyCode")}
              </Button>
              <Button
                full
                variant="secondary"
                disabled={working}
                onClick={() => {
                  setWaStep("phone");
                  setCode("");
                  setDevCode(null);
                  setHint("");
                }}
              >
                {t(lang, "changeNumber")}
              </Button>
            </div>
          )}
        </AuthEntryShell>
      );
    }

    if (view === "email-login") {
      return (
        <AuthEntryShell
          title={t(lang, "loginEmailTitle")}
          body={t(lang, "loginEmailBody")}
          alertError={alertError}
          {...shellBack}
        >
          <p className="mt-4 text-sm leading-relaxed text-navy/60">
            {signupOpen ? t(lang, "loginEmailOpenHint") : t(lang, "loginEmailInviteHint")}
          </p>
          <div className="card mt-6 space-y-4 p-5 sm:p-6">
            <Field id="email-login" label={t(lang, "loginEmail")}>
              <input
                id="email-login"
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                dir="ltr"
              />
            </Field>
            <Field id="password-login" label={t(lang, "loginPassword")}>
              <input
                id="password-login"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                dir="ltr"
              />
            </Field>
            <Button full disabled={working} onClick={() => emailAction("login")}>
              {t(lang, "verifyCode")}
            </Button>
            {signupOpen ? (
              <button
                type="button"
                className="w-full text-center text-sm text-navy/60 underline-offset-4 hover:underline"
                onClick={() => setView("signup")}
              >
                {t(lang, "loginNeedAccount")}
              </button>
            ) : null}
            <button
              type="button"
              className="w-full text-center text-sm text-navy/60 underline-offset-4 hover:underline"
              onClick={() => setView("forgot")}
            >
              {t(lang, "loginForgotPassword")}
            </button>
          </div>
        </AuthEntryShell>
      );
    }

    if (view === "signup") {
      if (!signupOpen) {
        return (
          <AuthEntryShell
            title={t(lang, "loginTitle")}
            body={t(lang, "inviteOnlyNotice")}
            alertError={alertError}
            {...shellBack}
          >
            <div className="mt-8">
              <Button full onClick={() => setView("chooser")}>
                {t(lang, "loginBackMethods")}
              </Button>
            </div>
          </AuthEntryShell>
        );
      }
      return (
        <AuthEntryShell
          title={t(lang, "loginSignupTitle")}
          body={t(lang, "loginSignupBody")}
          alertError={alertError}
          {...shellBack}
        >
          <div className="card mt-8 space-y-4 p-5 sm:p-6">
            <Field id="signup-name" label={t(lang, "loginYourName")}>
              <VoiceInput id="signup-name" lang={lang} value={name} onChange={setName} autoComplete="name" />
            </Field>
            <Field id="signup-email" label={t(lang, "loginEmail")}>
              <input
                id="signup-email"
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                dir="ltr"
              />
            </Field>
            <Field id="signup-password" label={t(lang, "loginPassword")}>
              <input
                id="signup-password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                dir="ltr"
              />
            </Field>
            <p className="text-xs text-navy/55">{t(lang, "loginPasswordHint")}</p>
            <Button full disabled={working} onClick={() => emailAction("signup")}>
              {t(lang, "loginCreateAccount")}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-navy/60 underline-offset-4 hover:underline"
              onClick={() => setView("email-login")}
            >
              {t(lang, "loginHaveAccount")}
            </button>
          </div>
        </AuthEntryShell>
      );
    }

    if (view === "forgot") {
      return (
        <AuthEntryShell
          title={t(lang, "loginForgotTitle")}
          body={t(lang, "loginForgotBody")}
          alertError={alertError}
          {...shellBack}
        >
          <div className="card mt-8 space-y-4 p-5 sm:p-6">
            <Field id="forgot-email" label={t(lang, "loginEmail")}>
              <input
                id="forgot-email"
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                dir="ltr"
              />
            </Field>
            {hint ? <p className="text-sm text-navy/65">{hint}</p> : null}
            <Button full disabled={working} onClick={() => emailAction("forgot")}>
              {t(lang, "loginSendReset")}
            </Button>
          </div>
        </AuthEntryShell>
      );
    }

    if (view === "reset") {
      return (
        <AuthEntryShell
          title={t(lang, "loginResetTitle")}
          body={t(lang, "loginResetBody")}
          alertError={alertError}
          {...shellBack}
        >
          <div className="card mt-8 space-y-4 p-5 sm:p-6">
            {hint ? <p className="text-sm text-navy/65">{hint}</p> : null}
            <Field id="reset-password" label={t(lang, "loginNewPassword")}>
              <input
                id="reset-password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                dir="ltr"
              />
            </Field>
            <p className="text-xs text-navy/55">{t(lang, "loginPasswordHint")}</p>
            <Button full disabled={working || !resetToken} onClick={() => emailAction("reset")}>
              {t(lang, "loginSavePassword")}
            </Button>
          </div>
        </AuthEntryShell>
      );
    }
  }

  if (needsSetup) {
    const identity = sessionPhone || sessionEmail;
    if (!signupOpen) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-navy/55">StockPulse</p>
              <span className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
            </div>
            <LanguageMenu align="end" />
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-navy sm:text-4xl">
            {t(lang, "loginTitle")}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-navy/70">{t(lang, "inviteOnlyNotice")}</p>
          {identity ? (
            <p className="mt-2 text-sm text-navy/60">
              {t(lang, "loggedInAs")} <span dir="ltr" className="font-semibold text-navy">{identity}</span>
            </p>
          ) : null}
          <div className="mt-8">
            <Button full disabled={busy} onClick={() => logout()}>
              {t(lang, "logOut")}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-navy/55">StockPulse</p>
            <span className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
          </div>
          <LanguageMenu align="end" />
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-navy sm:text-4xl">
          {t(lang, "setupTitle")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-navy/70">{t(lang, "setupBody")}</p>
        {identity ? (
          <p className="mt-2 text-sm text-navy/60">
            {t(lang, "loggedInAs")} <span dir="ltr" className="font-semibold text-navy">{identity}</span>
          </p>
        ) : null}

        <div className="card mt-8 p-5 sm:p-6">
          <Field id="business" label={t(lang, "businessName")} error={setupError}>
            <VoiceInput
              id="business"
              lang={lang}
              value={businessName}
              onChange={(next) => {
                setBusinessName(next);
                if (setupError) setSetupError("");
              }}
              placeholder={t(lang, "businessNamePlaceholder")}
              autoComplete="organization"
            />
          </Field>
        </div>

        <div className="card mt-4 p-5 sm:p-6">
          <p className="text-sm font-semibold text-navy">{t(lang, "gettingStarted")}</p>
          <ol className="mt-4 space-y-3">
            {[t(lang, "step1"), t(lang, "step2"), t(lang, "step3")].map((stepLabel, index) => (
              <li key={stepLabel} className="flex items-center gap-3 text-sm text-navy/80">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-cream">
                  {index + 1}
                </span>
                {stepLabel}
              </li>
            ))}
          </ol>
        </div>

        {storeError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {storeError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <Button full disabled={busy} onClick={startReal}>
            {t(lang, "getStarted")}
          </Button>
          <Button full variant="secondary" disabled={busy} onClick={startWithSample}>
            {busy ? "…" : t(lang, "trySample")}
          </Button>
        </div>
      </div>
    );
  }

  return <div className="min-h-dvh bg-cream" />;
}
