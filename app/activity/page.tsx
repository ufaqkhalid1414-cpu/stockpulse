"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { BackLabel, Lead } from "@/components/ui";
import { formatActivityCard } from "@/lib/activity-display";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";
import type { ActivityCategory, ActivityHistoryItem } from "@/lib/types";

/** Owner-only dedicated Activity screen — see lib/db/activity.ts for the audit log itself. */
export default function ActivityPage() {
  const { state, homePath, role } = useStock();
  const lang = state.language;
  const isOwner = role === "equal_owner" || role === "co_owner";
  const [rows, setRows] = useState<ActivityHistoryItem[]>(state.activityHistory ?? []);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ActivityCategory>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/activity", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as { activity?: ActivityHistoryItem[] };
      if (data.activity) setRows(data.activity);
    } catch {
      /* keep whatever we already have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void load();
  }, [load, isOwner]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.category === filter);
  }, [rows, filter]);

  if (!isOwner) return null;

  return (
    <AppShell>
      <BackLabel label={t(lang, "back")} fallback={homePath || "/dashboard"} />
      <div className="mt-6">
        <Lead title={t(lang, "activityHistory")} support={t(lang, "activityHistorySupport")} />
      </div>

      <div className="card mt-6 space-y-4 p-5 sm:p-6">
        <Menu
          label={t(lang, "activityHistory")}
          value={filter}
          align="start"
          options={[
            { value: "all", label: t(lang, "activityFilterAll") },
            { value: "stock", label: t(lang, "activityFilterStock") },
            { value: "prices", label: t(lang, "activityFilterPrices") },
            { value: "products", label: t(lang, "activityFilterProducts") },
            { value: "staff", label: t(lang, "activityFilterStaff") },
            { value: "settings", label: t(lang, "activityFilterSettings") },
            { value: "security", label: t(lang, "activityFilterSecurity") },
          ]}
          onChange={(value) => setFilter(value as "all" | ActivityCategory)}
        />

        {loading ? (
          <p className="text-sm text-navy/60">…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-navy/70">{t(lang, "activityHistoryEmpty")}</p>
        ) : (
          <ul className="divide-y divide-navy/10 rounded-xl border border-navy/10 bg-white">
            {filtered.map((entry) => {
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
    </AppShell>
  );
}
