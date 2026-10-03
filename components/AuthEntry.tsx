"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button, Field } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

/** WhatsApp OTP login + first-time business setup. */
export function AuthEntry() {
  const {
    state,
    authenticated,
    needsSetup,
    phone: sessionPhone,
    startFresh,
    startSample,
    requestOtp,
    verifyOtp,
    busy,
    error: storeError,
  } = useStock();
  const lang = state.language;

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function sendCode() {
    setError("");
    setHint("");
    setDevCode(null);
    try {
      const result = await requestOtp(phone);
      setStep("code");
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
    setError("");
    try {
      await verifyOtp(phone, code.trim());
    } catch {
      /* store error */
    }
  }

  async function startReal() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t(lang, "nameRequired"));
      return;
    }
    await startFresh(trimmed);
  }

  async function startWithSample() {
    await startSample(name.trim() || "General Store");
  }

  if (!authenticated) {
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
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-navy sm:text-4xl">
          {t(lang, "loginTitle")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-navy/70">{t(lang, "loginBody")}</p>

        {step === "phone" ? (
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
            <Button full disabled={busy} onClick={sendCode}>
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
            <Button full disabled={busy} onClick={confirmCode}>
              {t(lang, "verifyCode")}
            </Button>
            <Button
              full
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setCode("");
                setDevCode(null);
                setHint("");
              }}
            >
              {t(lang, "changeNumber")}
            </Button>
          </div>
        )}

        {storeError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {storeError}
          </p>
        ) : null}
      </div>
    );
  }

  if (needsSetup) {
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
        {sessionPhone ? (
          <p className="mt-2 text-sm text-navy/60">
            {t(lang, "loggedInAs")} <span dir="ltr" className="font-semibold text-navy">{sessionPhone}</span>
          </p>
        ) : null}

        <div className="card mt-8 p-5 sm:p-6">
          <Field id="business" label={t(lang, "businessName")} error={error}>
            <VoiceInput
              id="business"
              lang={lang}
              value={name}
              onChange={(next) => {
                setName(next);
                if (error) setError("");
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
