"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InstallStockPulse } from "@/components/InstallStockPulse";
import { LanguageMenu } from "@/components/LanguageMenu";
import { AppLink, Button, CheckIcon, CrossIcon, Field, Lead } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatDateTime, formatWhen } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { markScrollTop } from "@/lib/scroll";
import { useStock } from "@/lib/store";
import type { StockPlace } from "@/lib/types";
import { useRouter } from "next/navigation";

type StatusRow = {
  ok: boolean;
  label: string;
  detail: string | null;
  hint: string | null;
  at?: string | null;
  provider?: string;
};

type SystemStatus = {
  database: StatusRow;
  whatsapp: StatusRow;
  lastBackup: StatusRow & { at: string | null };
  delivery?: {
    sent: number;
    failed: number;
    windowClosed: number;
    lastFailReason: string | null;
    summary: string;
    notDelivering: boolean;
  };
};

type NotifPrefs = {
  dailyReport: boolean;
  dailyReportTime: string;
  priceAlerts: boolean;
  lowStockAlerts: boolean;
  recountAlerts: boolean;
  monthlyChart: boolean;
  pauseAll: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  dailyReport: true,
  dailyReportTime: "20:00",
  priceAlerts: true,
  lowStockAlerts: true,
  recountAlerts: true,
  monthlyChart: true,
  pauseAll: false,
};

export default function SettingsPage() {
  const {
    state,
    setBusinessName,
    runBackup,
    sendDailyReport,
    sendMonthlyChart,
    updateNotificationPrefs,
    requestChangeMyNumber,
    confirmChangeMyNumber,
    addPlace,
    renamePlace,
    removePlace,
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
  const [reportDeliveryOpen, setReportDeliveryOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [shopToken, setShopToken] = useState("");
  const [showBackupHistory, setShowBackupHistory] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(true);
  const [confirmLogoutEverywhere, setConfirmLogoutEverywhere] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneDevCode, setPhoneDevCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [newNames, setNewNames] = useState({ warehouse: "", shop: "", online: "" });
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [editingPlaceName, setEditingPlaceName] = useState("");
  const shopify = state.shopify;
  const allPlaces = state.places || [];
  const warehouses = allPlaces.filter((p) => p.kind === "warehouse");
  const shops = allPlaces.filter((p) => p.kind === "shop");
  const onlineStores = allPlaces.filter((p) => p.kind === "online");

  const myOwner = state.owners.find((o) => {
    const a = (o.phone || "").replace(/\s/g, "");
    const b = (phone || "").replace(/\s/g, "");
    return a && b && a === b;
  });
  const prefs: NotifPrefs = {
    ...DEFAULT_PREFS,
    ...(myOwner?.notificationPrefs || {}),
  };

  const loadSystemStatus = useCallback(async () => {
    if (!isOwner) {
      setSystemStatusLoading(false);
      return;
    }
    setSystemStatusLoading(true);
    try {
      const res = await fetch("/api/system-status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SystemStatus;
      setSystemStatus(data);
    } catch {
      /* keep prior */
    } finally {
      setSystemStatusLoading(false);
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
                    ? systemStatus.database.provider === "firebase"
                      ? t(lang, "statusFirebaseConnected")
                      : t(lang, "statusConnected")
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
                hint={
                  systemStatus.delivery?.notDelivering
                    ? t(lang, "statusWhatsAppNotDelivering")
                    : systemStatus.whatsapp.ok
                      ? null
                      : t(lang, "statusWhatsAppBad")
                }
              />
              {systemStatus.delivery ? (
                <StatusLine
                  ok={!systemStatus.delivery.notDelivering && systemStatus.delivery.failed === 0}
                  title={t(lang, "statusDelivery")}
                  value={systemStatus.delivery.summary}
                  hint={
                    systemStatus.delivery.windowClosed > 0
                      ? "Window closed"
                      : systemStatus.delivery.lastFailReason
                  }
                />
              ) : null}
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
            <p className="text-sm text-navy/55" aria-live="polite">
              {systemStatusLoading ? t(lang, "systemStatusChecking") : t(lang, "systemStatusUnavailable")}
            </p>
          )}
        </div>
      ) : null}

      <div className="card mt-4 space-y-3 p-5 sm:p-6">
        <div>
          <p className="font-semibold text-navy">{t(lang, "activityHistory")}</p>
          <p className="mt-1 text-sm text-navy/70">{t(lang, "activityHistorySupport")}</p>
        </div>
        <AppLink href="/activity" className="lift inline-flex items-center text-base font-bold text-navy">
          {t(lang, "goToActivity")}
        </AppLink>
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
          {isOwner ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                if (!confirmLogoutEverywhere) {
                  setConfirmLogoutEverywhere(true);
                  return;
                }
                await logout(true);
                markScrollTop();
                router.push("/", { scroll: false });
              }}
            >
              {confirmLogoutEverywhere ? t(lang, "logOutEverywhereConfirm") : t(lang, "logOutEverywhere")}
            </Button>
          ) : null}
        </div>
        {isOwner ? <p className="text-xs text-navy/55">{t(lang, "logOutEverywhereSupport")}</p> : null}
        {isOwner ? (
          <div className="mt-4 max-w-sm">
            <InstallStockPulse lang={lang} />
          </div>
        ) : null}
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

      {isOwner ? (
        <div className="card mt-4 space-y-8 p-5 sm:p-6">
          <div>
            <p className="text-lg font-bold text-navy">{t(lang, "placesIntroTitle")}</p>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "placesIntroSupport")}</p>
          </div>
          <PlaceKindEditor
            lang={lang}
            title={t(lang, "warehousesTitle")}
            support={t(lang, "warehousesSupport")}
            nameLabel={t(lang, "warehouseNameLabel")}
            addLabel={t(lang, "warehouseAdd")}
            placeholder="e.g. Lahore warehouse"
            places={warehouses}
            newName={newNames.warehouse}
            setNewName={(v) => setNewNames((n) => ({ ...n, warehouse: v }))}
            editingPlaceId={editingPlaceId}
            editingPlaceName={editingPlaceName}
            setEditingPlaceId={setEditingPlaceId}
            setEditingPlaceName={setEditingPlaceName}
            busy={busy}
            onAdd={async () => {
              await addPlace("warehouse", newNames.warehouse.trim());
              setNewNames((n) => ({ ...n, warehouse: "" }));
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRename={async (id, name) => {
              await renamePlace(id, name);
              setEditingPlaceId(null);
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRemove={async (id) => {
              if (!window.confirm(t(lang, "warehouseRemoveConfirm"))) return;
              await removePlace(id);
              setNotice(t(lang, "warehouseSaved"));
            }}
          />
          <PlaceKindEditor
            lang={lang}
            title={t(lang, "shopsTitle")}
            support={t(lang, "shopsSupport")}
            nameLabel={t(lang, "shopNameLabel")}
            addLabel={t(lang, "shopAdd")}
            placeholder="e.g. Main street shop"
            places={shops}
            newName={newNames.shop}
            setNewName={(v) => setNewNames((n) => ({ ...n, shop: v }))}
            editingPlaceId={editingPlaceId}
            editingPlaceName={editingPlaceName}
            setEditingPlaceId={setEditingPlaceId}
            setEditingPlaceName={setEditingPlaceName}
            busy={busy}
            onAdd={async () => {
              await addPlace("shop", newNames.shop.trim());
              setNewNames((n) => ({ ...n, shop: "" }));
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRename={async (id, name) => {
              await renamePlace(id, name);
              setEditingPlaceId(null);
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRemove={async (id) => {
              if (!window.confirm(t(lang, "warehouseRemoveConfirm"))) return;
              await removePlace(id);
              setNotice(t(lang, "warehouseSaved"));
            }}
          />
          <PlaceKindEditor
            lang={lang}
            title={t(lang, "onlineStoresTitle")}
            support={t(lang, "onlineStoresSupport")}
            nameLabel={t(lang, "onlineStoreNameLabel")}
            addLabel={t(lang, "onlineStoreAdd")}
            placeholder="e.g. Shopify store"
            places={onlineStores}
            newName={newNames.online}
            setNewName={(v) => setNewNames((n) => ({ ...n, online: v }))}
            editingPlaceId={editingPlaceId}
            editingPlaceName={editingPlaceName}
            setEditingPlaceId={setEditingPlaceId}
            setEditingPlaceName={setEditingPlaceName}
            busy={busy}
            onAdd={async () => {
              await addPlace("online", newNames.online.trim());
              setNewNames((n) => ({ ...n, online: "" }));
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRename={async (id, name) => {
              await renamePlace(id, name);
              setEditingPlaceId(null);
              setNotice(t(lang, "warehouseSaved"));
            }}
            onRemove={async (id) => {
              if (!window.confirm(t(lang, "warehouseRemoveConfirm"))) return;
              await removePlace(id);
              setNotice(t(lang, "warehouseSaved"));
            }}
          />
        </div>
      ) : null}

      {isOwner ? (
        <div className="card mt-4 space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-lg font-bold text-navy">{t(lang, "notificationsTitle")}</p>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "notificationsSupport")}</p>
          </div>

          <NotifSwitch
            label={t(lang, "notifPauseAll")}
            checked={prefs.pauseAll}
            disabled={busy}
            onChange={async (pauseAll) => {
              try {
                await updateNotificationPrefs({ pauseAll });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />
          <p className="text-xs text-navy/55">{t(lang, "notifPauseAllHint")}</p>

          <NotifSwitch
            label={t(lang, "notifDailyReport")}
            checked={prefs.dailyReport}
            disabled={busy || prefs.pauseAll}
            onChange={async (dailyReport) => {
              try {
                await updateNotificationPrefs({ dailyReport });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />
          {prefs.dailyReport && !prefs.pauseAll ? (
            <Field id="daily-report-time" label={t(lang, "notifDailyReportTime")}>
              <input
                id="daily-report-time"
                type="time"
                className="field"
                value={prefs.dailyReportTime || "20:00"}
                disabled={busy}
                onChange={async (e) => {
                  try {
                    await updateNotificationPrefs({ dailyReportTime: e.target.value || "20:00" });
                    setNotice(t(lang, "notificationsSaved"));
                  } catch {
                    /* store error */
                  }
                }}
              />
            </Field>
          ) : null}

          <NotifSwitch
            label={t(lang, "notifPriceAlerts")}
            checked={prefs.priceAlerts}
            disabled={busy || prefs.pauseAll}
            onChange={async (priceAlerts) => {
              try {
                await updateNotificationPrefs({ priceAlerts });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />
          <NotifSwitch
            label={t(lang, "notifLowStockAlerts")}
            checked={prefs.lowStockAlerts}
            disabled={busy || prefs.pauseAll}
            onChange={async (lowStockAlerts) => {
              try {
                await updateNotificationPrefs({ lowStockAlerts });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />
          <NotifSwitch
            label={t(lang, "notifRecountAlerts")}
            checked={prefs.recountAlerts}
            disabled={busy || prefs.pauseAll}
            onChange={async (recountAlerts) => {
              try {
                await updateNotificationPrefs({ recountAlerts });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />
          <NotifSwitch
            label={t(lang, "notifMonthlyChart")}
            checked={prefs.monthlyChart}
            disabled={busy || prefs.pauseAll}
            onChange={async (monthlyChart) => {
              try {
                await updateNotificationPrefs({ monthlyChart });
                setNotice(t(lang, "notificationsSaved"));
              } catch {
                /* store error */
              }
            }}
          />

          <div>
            <Button
              disabled={busy}
              onClick={() => {
                setReportDeliveryOpen((open) => !open);
              }}
            >
              {t(lang, "sendDailyReportTest")}
            </Button>
            {reportDeliveryOpen ? (
              <div
                className="mt-3 rounded-xl border border-navy/10 bg-cream/80 p-3"
                role="group"
                aria-label={t(lang, "reportDeliverChoose")}
              >
                <p className="text-sm font-medium text-navy/70">{t(lang, "reportDeliverChoose")}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    full
                    disabled={busy}
                    onClick={async () => {
                      try {
                        const result = await sendDailyReport("whatsapp");
                        setReportPreview(result.preview);
                        setNotice(t(lang, "reportSent"));
                        setReportDeliveryOpen(false);
                        void loadSystemStatus();
                      } catch {
                        /* error shown below */
                      }
                    }}
                  >
                    {t(lang, "reportViaWhatsApp")}
                  </Button>
                  <Button
                    full
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        const result = await sendDailyReport("email");
                        setReportPreview(result.preview);
                        setNotice(t(lang, "reportEmailSent"));
                        setReportDeliveryOpen(false);
                        void loadSystemStatus();
                      } catch {
                        /* error shown below */
                      }
                    }}
                  >
                    {t(lang, "reportViaEmail")}
                  </Button>
                </div>
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-navy/55 underline-offset-4 hover:underline"
                  disabled={busy}
                  onClick={() => setReportDeliveryOpen(false)}
                >
                  {t(lang, "reportCancelChoose")}
                </button>
              </div>
            ) : null}
          </div>
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

          <div className="border-t border-navy/10 pt-4">
            <p className="font-semibold text-navy">{t(lang, "changeMyNumber")}</p>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "changeMyNumberHint")}</p>
            <Field id="new-wa" label={t(lang, "changeMyNumberNew")}>
              <input
                id="new-wa"
                className="field"
                dir="ltr"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+92 300 1234567"
              />
            </Field>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={busy || !newPhone.trim()}
                onClick={async () => {
                  try {
                    const result = await requestChangeMyNumber(newPhone.trim());
                    setPhoneCodeSent(true);
                    setPhoneDevCode(result.devCode || "");
                    setNotice(t(lang, "sendCode"));
                  } catch {
                    /* store error */
                  }
                }}
              >
                {t(lang, "changeMyNumberSendCode")}
              </Button>
            </div>
            {phoneCodeSent ? (
              <>
                <Field id="wa-code" label={t(lang, "changeMyNumberCode")}>
                  <input
                    id="wa-code"
                    className="field"
                    dir="ltr"
                    inputMode="numeric"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value)}
                    placeholder="123456"
                  />
                </Field>
                {phoneDevCode ? (
                  <p className="text-sm text-navy/60" dir="ltr">
                    Dev code: {phoneDevCode}
                  </p>
                ) : null}
                <Button
                  disabled={busy || phoneCode.length !== 6}
                  onClick={async () => {
                    try {
                      await confirmChangeMyNumber(newPhone.trim(), phoneCode);
                      setNotice(t(lang, "changeMyNumberDone"));
                      await logout();
                      markScrollTop();
                      router.push("/login", { scroll: false });
                    } catch {
                      /* store error */
                    }
                  }}
                >
                  {t(lang, "changeMyNumberConfirm")}
                </Button>
              </>
            ) : null}
          </div>

          {notice ? <p className="text-sm font-medium text-pine">{notice}</p> : null}
          {reportPreview ? (
            <div>
              <p className="text-sm font-medium text-navy/70">{t(lang, "reportPreview")}</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-3 text-sm text-navy">{reportPreview}</pre>
            </div>
          ) : null}
          {error ? <p className="text-sm font-medium text-clay">{error}</p> : null}
        </div>
      ) : null}

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

function PlaceKindEditor({
  lang,
  title,
  support,
  nameLabel,
  addLabel,
  placeholder,
  places,
  newName,
  setNewName,
  editingPlaceId,
  editingPlaceName,
  setEditingPlaceId,
  setEditingPlaceName,
  busy,
  onAdd,
  onRename,
  onRemove,
}: {
  lang: Lang;
  title: string;
  support: string;
  nameLabel: string;
  addLabel: string;
  placeholder: string;
  places: StockPlace[];
  newName: string;
  setNewName: (v: string) => void;
  editingPlaceId: string | null;
  editingPlaceName: string;
  setEditingPlaceId: (id: string | null) => void;
  setEditingPlaceName: (name: string) => void;
  busy: boolean;
  onAdd: () => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const fieldId = `new-place-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-4 border-t border-navy/10 pt-6 first:border-t-0 first:pt-0">
      <div>
        <p className="font-semibold text-navy">{title}</p>
        <p className="mt-1 text-sm text-navy/60">{support}</p>
      </div>
      <ul className="space-y-3">
        {places.map((place) => (
          <li key={place.id} className="flex flex-wrap items-center gap-2">
            {editingPlaceId === place.id ? (
              <>
                <input
                  className="field min-w-[10rem] flex-1"
                  value={editingPlaceName}
                  onChange={(e) => setEditingPlaceName(e.target.value)}
                  aria-label={nameLabel}
                />
                <Button
                  disabled={busy || !editingPlaceName.trim()}
                  onClick={async () => {
                    try {
                      await onRename(place.id, editingPlaceName.trim());
                    } catch {
                      /* store error */
                    }
                  }}
                >
                  {t(lang, "save")}
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-navy">{place.name}</span>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditingPlaceId(place.id);
                    setEditingPlaceName(place.name);
                  }}
                >
                  {t(lang, "warehouseRename")}
                </Button>
                {places.length > 1 ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await onRemove(place.id);
                      } catch {
                        /* store error */
                      }
                    }}
                  >
                    {t(lang, "warehouseRemove")}
                  </Button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <Field id={fieldId} label={nameLabel}>
        <input
          id={fieldId}
          className="field"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
        />
      </Field>
      <Button
        disabled={busy || !newName.trim()}
        onClick={async () => {
          try {
            await onAdd();
          } catch {
            /* store error */
          }
        }}
      >
        {addLabel}
      </Button>
    </div>
  );
}

function NotifSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void | Promise<void>;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm font-medium text-navy">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-navy"
        checked={checked}
        disabled={disabled}
        onChange={(e) => void onChange(e.target.checked)}
      />
    </label>
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
