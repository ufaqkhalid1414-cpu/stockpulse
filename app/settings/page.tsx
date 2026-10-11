"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Menu } from "@/components/Menu";
import { Button, CheckIcon, CrossIcon, Field, Lead } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatActivityCard } from "@/lib/activity-display";
import { formatDateTime, formatWhen } from "@/lib/format";
import { t } from "@/lib/i18n";
import { markScrollTop } from "@/lib/scroll";
import { useStock } from "@/lib/store";
import type { ActivityCategory } from "@/lib/types";
import { useRouter } from "next/navigation";

type StatusRow = {
  ok: boolean;
  label: string;
  detail: string | null;
  hint: string | null;
  at?: string | null;
};

type SystemStatus = {
  database: StatusRow;
  whatsapp: StatusRow;
  lastBackup: StatusRow & { at: string | null };
};

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
  const [showBackupHistory, setShowBackupHistory] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(true);
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityCategory>("all");
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const shopify = state.shopify;

  const activityRows = useMemo(() => {
    const rows = state.activityHistory ?? [];
    if (activityFilter === "all") return rows;
    return rows.filter((row) => row.category === activityFilter);
  }, [state.activityHistory, activityFilter]);

  const loadSystemStatus = useCallback(async () => {
    if (!isOwner) return;
    try {
      const res = await fetch("/api/system-status");
      if (!res.ok) return;
      const data = (await res.json()) as SystemStatus;
      setSystemStatus(data);
    } catch {
      /* keep prior */
    }
  }, [isOwner]);

  useEffect(() => {
    setName(state.businessName);
  }, [state.businessName]);

  useEffect(() => {
    if (shopify?.shopDomain) setShopDomain(shopify.shopDomain);
  }, [shopify?.shopDomain]);

  useEffect(() => {
    void loadSystemStatus();
  }, [loadSystemStatus, state.lastBackup]);

  return (
    <AppShell>
      <Lead
        title={state.lastBackup ? t(lang, "settingsLeadOk") : t(lang, "settingsLeadNone")}
        support={state.lastBackup ? t(lang, "settingsLeadOkSupport") : t(lang, "settingsLeadNoneSupport")}
      />

      {isOwner ? (
        <div className="card mt-6 space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-lg font-bold text-navy">{t(lang, "systemStatus")}</p>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "systemStatusSupport")}</p>
          </div>
          {systemStatus ? (
            <ul className="space-y-3">
              <StatusLine
                ok={systemStatus.database.ok}
                title={t(lang, "statusDatabase")}
                value={
                  systemStatus.database.ok
                    ? t(lang, "statusConnected")
                    : t(lang, "statusNotConnected")
                }
                hint={systemStatus.database.ok ? null : t(lang, "statusDatabaseBad")}
              />
              <StatusLine
                ok={systemStatus.whatsapp.ok}
                title={t(lang, "statusWhatsApp")}
                value={
                  systemStatus.whatsapp.ok
                    ? t(lang, "statusConnected")
                    : t(lang, "statusNotConnected")
                }
                hint={systemStatus.whatsapp.ok ? null : t(lang, "statusWhatsAppBad")}
              />
              <StatusLine
                ok={systemStatus.lastBackup.ok}
                title={t(lang, "statusLastBackup")}
                value={
                  systemStatus.lastBackup.at
                    ? formatDateTime(systemStatus.lastBackup.at, lang)
                    : t(lang, "statusBackupNone")
                }
                hint={null}
              />
            </ul>
          ) : (
            <p className="text-sm text-navy/55">…</p>
          )}
        </div>
      ) : null}

      <div className="card mt-4 space-y-4 p-5 sm:p-6">
        <div>
          <p className="font-semibold text-navy">{t(lang, "activityHistory")}</p>
          <p className="mt-1 text-sm text-navy/70">{t(lang, "activityHistorySupport")}</p>
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border-2 border-navy/20 bg-cream px-4 py-4 text-left transition hover:border-navy/35"
          onClick={() => setShowActivityHistory((open) => !open)}
          aria-expanded={showActivityHistory}
        >
          <span className="text-base font-bold text-navy sm:text-lg">
            {showActivityHistory ? t(lang, "activityHistoryHide") : t(lang, "activityHistoryOpen")}
          </span>
        </button>

        {showActivityHistory ? (
          <div className="space-y-3">
            <Menu
              label={t(lang, "activityHistory")}
              value={activityFilter}
              align="start"
              options={[
                { value: "all", label: t(lang, "activityFilterAll") },
                { value: "stock", label: t(lang, "activityFilterStock") },
                { value: "prices", label: t(lang, "activityFilterPrices") },
                { value: "products", label: t(lang, "activityFilterProducts") },
                { value: "staff", label: t(lang, "activityFilterStaff") },
                { value: "settings", label: t(lang, "activityFilterSettings") },
              ]}
              onChange={(value) => setActivityFilter(value as "all" | ActivityCategory)}
            />
            {activityRows.length === 0 ? (
              <p className="text-sm text-navy/70">{t(lang, "activityHistoryEmpty")}</p>
            ) : (
              <ul className="divide-y divide-navy/10 rounded-xl border border-navy/10 bg-white">
                {activityRows.map((entry) => {
                  const card = formatActivityCard(lang, entry);
                  return (
                    <li key={entry.id} className="space-y-1.5 px-4 py-3.5 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-navy">{card.who}</p>
                        <p className="text-xs font-medium text-navy/50">{card.action}</p>
                      </div>
                      <p className="text-navy">{card.what}</p>
                      {card.where ? <p className="text-navy/70">{card.where}</p> : null}
                      {card.change ? (
                        <p className="font-medium text-navy/80" dir="ltr">
                          {card.change}
                        </p>
                      ) : null}
                      <p className="text-xs text-navy/55" dir="ltr">
                        {card.when}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="card mt-4 space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {state.lastBackup ? <CheckIcon /> : null}
          <div>
            <p className="font-semibold text-navy">{t(lang, "lastBackup")}</p>
            <p className="mt-1 text-sm text-navy/70">
              {state.lastBackup
                ? t(lang, "backupOk", { time: formatDateTime(state.lastBackup, lang) })
                : t(lang, "noBackup")}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            await runBackup();
            setBackupFlash(true);
            setShowBackupHistory(true);
            window.setTimeout(() => setBackupFlash(false), 2000);
            void loadSystemStatus();
          }}
        >
          {backupFlash ? t(lang, "backupDone") : t(lang, "runBackupNow")}
        </Button>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border-2 border-navy/20 bg-cream px-4 py-4 text-left transition hover:border-navy/35"
          onClick={() => setShowBackupHistory((open) => !open)}
          aria-expanded={showBackupHistory}
        >
          <span className="text-base font-bold text-navy sm:text-lg">
            {showBackupHistory ? t(lang, "backupHistoryHide") : t(lang, "backupHistoryOpen")}
          </span>
        </button>

        {showBackupHistory ? (
          <div className="rounded-xl border border-navy/10 bg-white px-4 py-3">
            <p className="font-semibold text-navy">{t(lang, "backupHistory")}</p>
            {state.backupHistory.length === 0 ? (
              <p className="mt-2 text-sm text-navy/70">{t(lang, "backupHistoryEmpty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-navy/10">
                {state.backupHistory.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-navy" dir="ltr">
                        {formatDateTime(entry.stampedAt, lang)}
                      </p>
                      {entry.status === "failed" ? (
                        <p className="mt-0.5 text-xs text-navy/55">{t(lang, "backupFailedPlain")}</p>
                      ) : null}
                    </div>
                    <span
                      className={
                        entry.status === "success"
                          ? "shrink-0 font-medium text-pine"
                          : "shrink-0 font-medium text-clay"
                      }
                    >
                      {entry.status === "success"
                        ? t(lang, "backupStatusSuccess")
                        : t(lang, "backupStatusFailed")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="card mt-4 space-y-6 p-5 sm:p-6">
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

function StatusLine({
  ok,
  title,
  value,
  hint,
}: {
  ok: boolean;
  title: string;
  value: string;
  hint: string | null;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-cream px-4 py-3">
      <span className="mt-0.5" aria-hidden>
        {ok ? <CheckIcon /> : <CrossIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy">
          {title}: <span className={ok ? "text-pine" : "text-clay"}>{value}</span>{" "}
          <span aria-hidden>{ok ? "✓" : "✗"}</span>
        </p>
        {!ok && hint ? <p className="mt-1 text-sm text-navy/65">{hint}</p> : null}
      </div>
    </li>
  );
}
