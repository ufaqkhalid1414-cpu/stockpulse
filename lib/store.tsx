"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultState } from "@/lib/data";
import type { Lang } from "@/lib/i18n";
import type { AlertItem, AppState, Location, Permission, Product } from "@/lib/types";

type StoreValue = {
  ready: boolean;
  busy: boolean;
  error: string | null;
  state: AppState;
  setLanguage: (language: Lang) => Promise<void>;
  setBusinessName: (businessName: string) => Promise<void>;
  setOwnerWhatsapp: (ownerWhatsapp: string) => Promise<void>;
  startFresh: (businessName: string) => Promise<void>;
  startSample: (businessName: string) => Promise<void>;
  addProduct: (input: {
    name: string;
    category: string;
    variant: string;
    location: Location;
    quantity: number;
    purchasePrice: number;
    photo?: string;
  }) => Promise<void>;
  addStaff: (name: string, phone: string, permission: Permission) => Promise<void>;
  recordSale: (productId: string, location: Location, quantity: number) => Promise<void>;
  recordPurchasePrice: (productId: string, price: number) => Promise<{ alert: AlertItem | null }>;
  runBackup: () => Promise<void>;
  sendDailyReport: () => Promise<{ preview: string; sent: unknown }>;
  sendWeeklyChart: (productId?: string) => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

type ApiBusiness = AppState & {
  id?: string;
  ownerWhatsapp?: string | null;
  priceThreshold?: number;
  alerts?: AlertItem[];
  isSample?: boolean;
};

function toState(business: ApiBusiness | null | undefined): AppState {
  if (!business) return defaultState;
  return {
    onboarded: true,
    businessName: business.businessName,
    language: business.language,
    products: business.products ?? [],
    staff: business.staff ?? [],
    lastBackup: business.lastBackup ?? null,
    connectedStores: business.connectedStores ?? 0,
    ownerWhatsapp: business.ownerWhatsapp ?? null,
    priceThreshold: business.priceThreshold ?? 10,
    alerts: business.alerts ?? [],
    isSample: Boolean(business.isSample),
  };
}

function networkMessage(err: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (err instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

async function readJson(res: Response) {
  let data: { business?: ApiBusiness | null; error?: string; alert?: AlertItem | null; preview?: string; sent?: unknown };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error(res.ok ? "Unexpected response from server" : `Request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/business", { cache: "no-store" });
    const data = await readJson(res);
    setState(toState(data.business));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setState(defaultState);
          setError(networkMessage(err));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const message = networkMessage(err);
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const patchBusiness = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      setState(toState(data.business));
    },
    [],
  );

  const stockAction = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson(res);
  }, []);

  const setLanguage = useCallback(
    async (language: Lang) => {
      if (!state.onboarded) {
        setState((current) => ({ ...current, language }));
        return;
      }
      await run(() => patchBusiness({ language }));
    },
    [patchBusiness, run, state.onboarded],
  );

  const setBusinessName = useCallback(
    async (businessName: string) => {
      await run(() => patchBusiness({ name: businessName }));
    },
    [patchBusiness, run],
  );

  const setOwnerWhatsapp = useCallback(
    async (ownerWhatsapp: string) => {
      await run(() => patchBusiness({ ownerWhatsapp: ownerWhatsapp.trim() || null }));
    },
    [patchBusiness, run],
  );

  const startFresh = useCallback(
    async (businessName: string) => {
      await run(async () => {
        const res = await fetch("/api/business", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", name: businessName, language: state.language }),
        });
        const data = await readJson(res);
        setState(toState(data.business));
      });
    },
    [run, state.language],
  );

  const startSample = useCallback(
    async (businessName: string) => {
      await run(async () => {
        const res = await fetch("/api/business", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sample", name: businessName || "General Store", language: state.language }),
        });
        const data = await readJson(res);
        setState(toState(data.business));
      });
    },
    [run, state.language],
  );

  const addProduct = useCallback(
    async (input: {
      name: string;
      category: string;
      variant: string;
      location: Location;
      quantity: number;
      purchasePrice: number;
      photo?: string;
    }) => {
      await run(async () => {
        const data = await stockAction({ action: "addProduct", ...input });
        setState(toState(data.business));
      });
    },
    [run, stockAction],
  );

  const addStaff = useCallback(
    async (name: string, phone: string, permission: Permission) => {
      await run(async () => {
        const data = await stockAction({ action: "addStaff", name, phone, permission });
        setState(toState(data.business));
      });
    },
    [run, stockAction],
  );

  const recordSale = useCallback(
    async (productId: string, location: Location, quantity: number) => {
      await run(async () => {
        const data = await stockAction({ action: "recordSale", productId, location, quantity });
        setState(toState(data.business));
      });
    },
    [run, stockAction],
  );

  const recordPurchasePrice = useCallback(
    async (productId: string, price: number) => {
      return run(async () => {
        const data = await stockAction({ action: "recordPurchasePrice", productId, price });
        setState(toState(data.business));
        return { alert: data.alert ?? null };
      });
    },
    [run, stockAction],
  );

  const runBackup = useCallback(async () => {
    await run(async () => {
      const data = await stockAction({ action: "backup" });
      setState(toState(data.business));
    });
  }, [run, stockAction]);

  const sendDailyReport = useCallback(async () => {
    return run(async () => {
      const data = await stockAction({ action: "sendDailyReport" });
      const sent = data.sent as { ok?: boolean; skipped?: boolean } | undefined;
      if (sent?.skipped) {
        throw new Error("WhatsApp is not configured yet — report was prepared but not sent.");
      }
      if (sent && sent.ok === false) {
        throw new Error("WhatsApp could not send the report. Check the number and Twilio sandbox limits.");
      }
      return { preview: data.preview || "", sent: data.sent };
    });
  }, [run, stockAction]);

  const sendWeeklyChart = useCallback(
    async (productId?: string) => {
      await run(async () => {
        const data = await stockAction({ action: "sendWeeklyChart", productId });
        const sent = data.sent as { ok?: boolean; skipped?: boolean } | undefined;
        if (sent?.skipped) {
          throw new Error("WhatsApp is not configured yet — chart was prepared but not sent.");
        }
        if (sent && sent.ok === false) {
          throw new Error("WhatsApp could not send the chart. Check the number and Twilio sandbox limits.");
        }
      });
    },
    [run, stockAction],
  );

  const reset = useCallback(async () => {
    await run(async () => {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      await readJson(res);
      setState(defaultState);
    });
  }, [run]);

  const value = useMemo(
    () => ({
      ready,
      busy,
      error,
      state,
      setLanguage,
      setBusinessName,
      setOwnerWhatsapp,
      startFresh,
      startSample,
      addProduct,
      addStaff,
      recordSale,
      recordPurchasePrice,
      runBackup,
      sendDailyReport,
      sendWeeklyChart,
      reset,
      refresh,
    }),
    [
      ready,
      busy,
      error,
      state,
      setLanguage,
      setBusinessName,
      setOwnerWhatsapp,
      startFresh,
      startSample,
      addProduct,
      addStaff,
      recordSale,
      recordPurchasePrice,
      runBackup,
      sendDailyReport,
      sendWeeklyChart,
      reset,
      refresh,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStock() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStock must be used inside StoreProvider");
  return value;
}

export type { Product };
