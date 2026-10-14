"use client";

import { useEffect } from "react";

/** Registers the PWA worker in production builds only. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore — installability still works via manifest alone in some browsers */
    });
  }, []);
  return null;
}
