"use client";

import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BackLabel, Button, Lead } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";
import type { ValidImportRow } from "@/lib/product-import";

type PreviewPayload = {
  readyCount: number;
  problemCount: number;
  existingCount: number;
  problems: { rowNumber: number; message: string }[];
  ready: ValidImportRow[];
  existing: ValidImportRow[];
};

export default function ImportPage() {
  const { state, role, homePath, refresh } = useStock();
  const lang = state.language;
  const isOwner = role === "equal_owner" || role === "co_owner";
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [existingMode, setExistingMode] = useState<"skip" | "add">("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    message: string;
    failed: { rowNumber: number; message: string }[];
    replayed?: boolean;
  } | null>(null);
  const importKey = useMemo(() => crypto.randomUUID(), []);

  if (!isOwner) {
    return (
      <AppShell>
        <Lead title={t(lang, "importTitle")} support={t(lang, "importStaffBlocked")} />
      </AppShell>
    );
  }

  async function runPreview(nextFile: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.set("mode", "preview");
      body.set("file", nextFile);
      const res = await fetch("/api/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data.preview as PreviewPayload);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!file || !preview) return;
    const count = existingMode === "add" ? preview.readyCount + preview.existingCount : preview.readyCount;
    if (count <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("mode", "commit");
      body.set("existingMode", existingMode);
      body.set("importKey", importKey);
      body.set("file", file);
      const res = await fetch("/api/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult({
        imported: Number(data.imported || 0),
        message: String(data.message || t(lang, "importDone", { ok: data.imported })),
        failed: Array.isArray(data.failed) ? data.failed : [],
        replayed: Boolean(data.replayed),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadFailedRows() {
    const rows = result?.failed?.length ? result.failed : preview?.problems || [];
    if (!rows.length) return;
    const csv = ["row,message", ...rows.map((r) => `${r.rowNumber},"${String(r.message).replace(/"/g, '""')}"`)].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stockpulse-import-failed.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const importCount =
    preview == null
      ? 0
      : existingMode === "add"
        ? preview.readyCount + preview.existingCount
        : preview.readyCount;

  return (
    <AppShell>
      <BackLabel label={t(lang, "back")} fallback={homePath || "/items"} />
      <div className="mt-6 max-w-xl">
        <Lead title={t(lang, "importTitle")} support={t(lang, "importSupport")} />

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/api/import/template"
            className="depth lift inline-flex min-h-[48px] items-center rounded-full border border-navy/20 bg-white px-5 text-sm font-semibold text-navy"
          >
            {t(lang, "importDownloadTemplate")}
          </a>
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            {t(lang, "importChooseFile")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0] || null;
              event.target.value = "";
              setFile(next);
              setPreview(null);
              setResult(null);
              if (next) void runPreview(next);
            }}
          />
        </div>

        {file ? <p className="mt-3 text-sm text-navy/65">{file.name}</p> : null}
        {busy ? <p className="mt-3 text-sm font-medium text-navy/70">{t(lang, "savingEllipsis")}</p> : null}
        {error ? (
          <p className="mt-3 rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-3 text-sm text-clay" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="card mt-6 space-y-4 p-5">
            <p className="text-lg font-bold text-navy">{t(lang, "importPreviewTitle")}</p>
            <ul className="space-y-1 text-sm text-navy/80">
              <li>{t(lang, "importReady", { count: preview.readyCount })}</li>
              <li>{t(lang, "importNeedFixing", { count: preview.problemCount })}</li>
              <li>{t(lang, "importAlreadyExist", { count: preview.existingCount })}</li>
            </ul>

            {preview.problems.length > 0 ? (
              <ul className="max-h-48 space-y-2 overflow-auto text-sm text-navy/75">
                {preview.problems.map((p) => (
                  <li key={`${p.rowNumber}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            ) : null}

            {preview.existingCount > 0 ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-navy">
                  <input
                    type="radio"
                    name="existingMode"
                    checked={existingMode === "skip"}
                    onChange={() => setExistingMode("skip")}
                  />
                  {t(lang, "importExistingSkip")}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-navy">
                  <input
                    type="radio"
                    name="existingMode"
                    checked={existingMode === "add"}
                    onChange={() => setExistingMode("add")}
                  />
                  {t(lang, "importExistingAdd")}
                </label>
              </div>
            ) : null}

            <Button type="button" full disabled={busy || importCount <= 0} onClick={() => void commitImport()}>
              {t(lang, "importConfirm", { count: importCount })}
            </Button>
          </div>
        ) : null}

        {result ? (
          <div className="card mt-6 space-y-3 p-5">
            <p className="font-semibold text-navy">{result.message}</p>
            {result.failed.length > 0 ? (
              <Button type="button" variant="secondary" onClick={downloadFailedRows}>
                {t(lang, "importFailedDownload")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
