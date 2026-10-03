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
  const {
    state,
    setBusinessName,
    runBackup,
    sendDailyReport,
    sendMonthlyChart,
    connectShopify,
    syncShopify,
    disconnectShopify,
    reset,
    logout,
    busy,
    error,
    phone,
    role,
  } = useStock();
  const lang = state.language;
  const canReset = role === "equal_owner";
  const isOwner = role === "equal_owner" || role === "co_owner";
  const router = useRouter();
  const [name, setName] = useState(state.businessName);
  const [saved, setSaved] = useState(false);
  const [backupFlash, setBackupFlash] = useState(false);
  const [reportPreview, setReportPreview] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [shopToken, setShopToken] = useState("");
  const shopify = state.shopify;

  useEffect(() => {
    setName(state.businessName);
  }, [state.businessName]);

  useEffect(() => {
    if (shopify?.shopDomain) setShopDomain(shopify.shopDomain);
  }, [shopify?.shopDomain]);

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
          <input
            id="owner-wa"
            className="field"
            value={phone || state.ownerWhatsapp || ""}
            readOnly
            dir="ltr"
          />
          <p className="mt-1.5 text-xs text-navy/55">{t(lang, "ownerWhatsappLocked")}</p>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={busy}
            onClick={async () => {
              if (!name.trim()) return;
              await setBusinessName(name.trim());
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
          >
            {saved ? t(lang, "saved") : t(lang, "saveChanges")}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              await logout();
              markScrollTop();
              router.push("/", { scroll: false });
            }}
          >
            {t(lang, "logOut")}
          </Button>
        </div>
      </div>

      {isOwner ? (
        <div className="card mt-4 space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-lg font-bold text-navy">{t(lang, "shopifyTitle")}</p>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "shopifySupport")}</p>
            <p className="mt-3 text-xs leading-relaxed text-navy/55">{t(lang, "shopifySteps")}</p>
          </div>

          {shopify?.connected ? (
            <div className="rounded-xl bg-cream px-4 py-3 text-sm text-navy">
              <p className="font-semibold">{t(lang, "shopifyConnected", { shop: shopify.shopDomain || "" })}</p>
              <p className="mt-1 text-navy/70">
                {shopify.lastSyncAt
                  ? t(lang, "shopifyLastSync", {
                      time: formatWhen(shopify.lastSyncAt, lang),
                      count: shopify.lastSyncCount,
                    })
                  : t(lang, "shopifyNeverSynced")}
              </p>
              {shopify.lastSyncError ? <p className="mt-2 text-clay">{shopify.lastSyncError}</p> : null}
            </div>
          ) : (
            <p className="text-sm font-medium text-navy/60">{t(lang, "shopifyNotConnected")}</p>
          )}

          {!shopify?.connected ? (
            <>
              <Field id="shop-domain" label={t(lang, "shopifyDomain")}>
                <input
                  id="shop-domain"
                  className="field"
                  dir="ltr"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder={t(lang, "shopifyDomainPlaceholder")}
                  autoComplete="off"
                />
              </Field>
              <Field id="shop-token" label={t(lang, "shopifyToken")}>
                <input
                  id="shop-token"
                  className="field"
                  dir="ltr"
                  type="password"
                  value={shopToken}
                  onChange={(e) => setShopToken(e.target.value)}
                  placeholder={t(lang, "shopifyTokenPlaceholder")}
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-navy/55">{t(lang, "shopifyTokenHint")}</p>
              </Field>
              <Button
                disabled={busy || !shopDomain.trim() || !shopToken.trim()}
                onClick={async () => {
                  try {
                    await connectShopify(shopDomain.trim(), shopToken.trim());
                    setShopToken("");
                    setNotice(t(lang, "shopifySaved"));
                  } catch {
                    /* store error */
                  }
                }}
              >
                {t(lang, "shopifySave")}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    const result = await syncShopify();
                    setNotice(t(lang, "shopifySyncOk", { count: result.count }));
                  } catch {
                    /* store error */
                  }
                }}
              >
                {t(lang, "shopifySync")}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    await disconnectShopify();
                    setShopToken("");
                    setNotice(t(lang, "shopifyDisconnected"));
                  } catch {
                    /* store error */
                  }
                }}
              >
                {t(lang, "shopifyDisconnect")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

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
              await sendMonthlyChart();
              setNotice(t(lang, "chartSent"));
            } catch {
              /* error shown below */
            }
          }}
        >
          {t(lang, "sendMonthlyChart")}
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

      {canReset ? (
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
      ) : role === "co_owner" ? (
        <p className="mt-8 text-sm text-navy/55">{t(lang, "coOwnerBlocked")}</p>
      ) : null}
    </AppShell>
  );
}
