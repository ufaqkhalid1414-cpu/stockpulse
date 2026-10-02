"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button, CheckIcon, Field, Lead } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatWhen } from "@/lib/format";
import { t } from "@/lib/i18n";
import { markScrollTop } from "@/lib/scroll";
import { useStock } from "@/lib/store";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { state, setBusinessName, setOwnerWhatsapp, runBackup, sendDailyReport, sendWeeklyChart, reset, busy, error } =
    useStock();
  const lang = state.language;
  const router = useRouter();
  const [name, setName] = useState(state.businessName);
  const [whatsapp, setWhatsapp] = useState(state.ownerWhatsapp || "");
  const [saved, setSaved] = useState(false);
  const [backupFlash, setBackupFlash] = useState(false);
  const [reportPreview, setReportPreview] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setName(state.businessName);
    setWhatsapp(state.ownerWhatsapp || "");
  }, [state.businessName, state.ownerWhatsapp]);

  return (
    <AppShell>
      <Lead
        title={state.lastBackup ? t(lang, "settingsLeadOk") : t(lang, "settingsLeadNone")}
        support={state.lastBackup ? t(lang, "settingsLeadOkSupport") : t(lang, "settingsLeadNoneSupport")}
      />

      <div className="card mt-6 space-y-6 p-5 sm:p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-navy/80">{t(lang, "language")}</p>
          <LanguageMenu align="start" />
        </div>
        <Field id="biz" label={t(lang, "businessName")}>
          <VoiceInput id="biz" lang={lang} value={name} onChange={setName} />
        </Field>
        <Field id="owner-wa" label={t(lang, "ownerWhatsapp")}>
          <VoiceInput
            id="owner-wa"
            lang={lang}
            value={whatsapp}
            onChange={setWhatsapp}
            placeholder={t(lang, "whatsappPlaceholder")}
            dir="ltr"
          />
          <p className="mt-1.5 text-xs text-navy/55">{t(lang, "ownerWhatsappHint")}</p>
        </Field>
        <div className="flex items-center gap-3">
          <Button
            disabled={busy}
            onClick={async () => {
              if (!name.trim()) return;
              await setBusinessName(name.trim());
              await setOwnerWhatsapp(whatsapp);
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
          >
            {saved ? t(lang, "saved") : t(lang, "saveChanges")}
          </Button>
        </div>
      </div>

      <div className="card mt-4 space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {state.lastBackup ? <CheckIcon /> : null}
          <div>
            <p className="font-semibold text-navy">{t(lang, "lastBackup")}</p>
            <p className="mt-1 text-sm text-navy/70">
              {state.lastBackup ? t(lang, "backupOk", { time: formatWhen(state.lastBackup, lang) }) : t(lang, "noBackup")}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            await runBackup();
            setBackupFlash(true);
            window.setTimeout(() => setBackupFlash(false), 2000);
          }}
        >
          {backupFlash ? t(lang, "backupDone") : t(lang, "runBackupNow")}
        </Button>
      </div>

      <div className="card mt-4 space-y-3 p-5 sm:p-6">
        <Button
          disabled={busy}
          onClick={async () => {
            try {
              const result = await sendDailyReport();
              setReportPreview(result.preview);
              setNotice(t(lang, "reportSent"));
            } catch {
              /* error shown below */
            }
          }}
        >
          {t(lang, "sendDailyReport")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            try {
              await sendWeeklyChart();
              setNotice(t(lang, "chartSent"));
            } catch {
              /* error shown below */
            }
          }}
        >
          {t(lang, "sendWeeklyChart")}
        </Button>
        {notice ? <p className="text-sm font-medium text-pine">{notice}</p> : null}
        {reportPreview ? (
          <div>
            <p className="text-sm font-medium text-navy/70">{t(lang, "reportPreview")}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-3 text-sm text-navy">{reportPreview}</pre>
          </div>
        ) : null}
        {error ? <p className="text-sm font-medium text-clay">{error}</p> : null}
      </div>

      <div className="mt-8">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            await reset();
            markScrollTop();
            router.push("/", { scroll: false });
          }}
        >
          {confirmReset ? t(lang, "resetConfirm") : t(lang, "resetDemo")}
        </Button>
      </div>
    </AppShell>
  );
}
