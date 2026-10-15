"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { t, type Lang } from "@/lib/i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

/** Install control — native prompt when available; always shows manual steps otherwise. */
export function InstallStockPulse({ lang, className = "" }: { lang: Lang; className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      setReady(true);
      return;
    }
    if (isIosSafari()) {
      setIosHint(true);
      setReady(true);
      return;
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    setReady(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready || installed) return null;

  if (iosHint) {
    return (
      <p className={`text-sm leading-relaxed text-navy/60 ${className}`.trim()}>{t(lang, "installIosHint")}</p>
    );
  }

  if (deferred) {
    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <Button
          variant="secondary"
          full
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            setDeferred(null);
          }}
        >
          {t(lang, "installStockPulse")}
        </Button>
        <p className="text-center text-xs leading-relaxed text-navy/50">{t(lang, "installDesktopHint")}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-navy/10 bg-white/70 px-4 py-4 text-center ${className}`.trim()}
    >
      <p className="text-sm font-semibold text-navy">{t(lang, "installStockPulse")}</p>
      <p className="mt-2 text-sm leading-relaxed text-navy/65">{t(lang, "installDesktopHint")}</p>
    </div>
  );
}
