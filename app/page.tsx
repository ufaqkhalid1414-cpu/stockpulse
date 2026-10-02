"use client";

import { useState } from "react";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button, Field } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function SetupPage() {
  const { state, startFresh, startSample, busy, error: storeError } = useStock();
  const lang = state.language;
  const [name, setName] = useState(state.businessName);
  const [error, setError] = useState("");

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-navy/55">StockPulse</p>
          <span className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
        </div>
        <LanguageMenu align="end" />
      </div>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-navy sm:text-4xl">{t(lang, "setupTitle")}</h1>
      <p className="mt-3 text-base leading-relaxed text-navy/70">{t(lang, "setupBody")}</p>

      <div className="card mt-8 p-5 sm:p-6">
        <Field id="business" label={t(lang, "businessName")} error={error}>
          <input
            id="business"
            className="field"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
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
          {[t(lang, "step1"), t(lang, "step2"), t(lang, "step3")].map((step, index) => (
            <li key={step} className="flex items-center gap-3 text-sm text-navy/80">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-cream">
                {index + 1}
              </span>
              {step}
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
