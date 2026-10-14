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

/** Secondary install control — never auto-prompts. */
export function InstallStockPulse({ lang, className = "" }: { lang: Lang; className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isIosSafari()) {
      setIosHint(true);
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
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (iosHint) {
    return (
      <p className={`text-sm leading-relaxed text-navy/60 ${className}`.trim()}>{t(lang, "installIosHint")}</p>
    );
  }

  if (!deferred) return null;

  return (
    <Button
      variant="secondary"
      full
      className={className}
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        setDeferred(null);
      }}
    >
      {t(lang, "installStockPulse")}
    </Button>
  );
}
