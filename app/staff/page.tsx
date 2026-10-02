"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { Button, Field, Lead } from "@/components/ui";
import { formatAdded } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";
import type { Permission } from "@/lib/types";

export default function StaffPage() {
  const { state, addStaff, busy, error: storeError } = useStock();
  const lang = state.language;
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [personName, setPersonName] = useState("");
  const [permission, setPermission] = useState<Permission>("add");
  const [error, setError] = useState("");
  const count = state.staff.length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = personName.trim();
    const trimmed = phone.trim();
    if (!trimmedName) {
      setError(t(lang, "nameRequiredStaff"));
      return;
    }
    if (!trimmed) {
      setError(t(lang, "phoneRequired"));
      return;
    }
    if (state.staff.some((member) => member.phone.replace(/\s/g, "") === trimmed.replace(/\s/g, ""))) {
      setError(t(lang, "phoneDuplicate"));
      return;
    }
    try {
      await addStaff(trimmedName, trimmed, permission);
      setPhone("");
      setPersonName("");
      setPermission("add");
      setError("");
      setOpen(false);
    } catch {
      /* store error */
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Lead
          title={count === 0 ? t(lang, "staffEmptyLead") : count === 1 ? t(lang, "staffLeadOne") : t(lang, "staffLead", { count })}
          support={count === 0 ? t(lang, "staffEmptySupport") : t(lang, "staffLeadSupport")}
        />
        <Button onClick={() => setOpen(true)}>{t(lang, "addStaff")}</Button>
      </div>

      {open && (
        <form className="card mt-6 space-y-4 p-5 sm:p-6" onSubmit={submit}>
          <Field id="staff-name" label={t(lang, "staffName")} error={error && !phone.trim() && !personName.trim() ? error : !personName.trim() && error === t(lang, "nameRequiredStaff") ? error : undefined}>
            <input
              id="staff-name"
              className="field"
              value={personName}
              onChange={(e) => {
                setPersonName(e.target.value);
                if (error) setError("");
              }}
              placeholder={t(lang, "staffNamePlaceholder")}
              autoComplete="name"
              required
            />
          </Field>
          <Field id="phone" label={t(lang, "whatsapp")} error={error && error !== t(lang, "nameRequiredStaff") ? error : undefined}>
            <input
              id="phone"
              className="field"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (error) setError("");
              }}
              placeholder={t(lang, "whatsappPlaceholder")}
              required
            />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "permission")}</p>
            <Menu
              label={t(lang, "permission")}
              value={permission}
              align="start"
              options={[
                { value: "add", label: t(lang, "canAdd") },
                { value: "view", label: t(lang, "viewOnly") },
              ]}
              onChange={(value) => setPermission(value as Permission)}
            />
          </div>
          {(storeError && open) ? <p className="text-sm font-medium text-clay">{storeError}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" disabled={busy}>
              {t(lang, "save")}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t(lang, "cancel")}
            </Button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-3">
        {state.staff.map((member) => (
          <li key={member.id} className="card p-5">
            <p className="text-lg font-bold text-navy">{member.name}</p>
            <p className="mt-1 text-sm font-bold text-navy" dir="ltr">
              {member.phone}
            </p>
            <p className="mt-1 text-sm text-navy/60">{formatAdded(member.addedAt, lang)}</p>
            <p className="mt-3 text-sm font-semibold text-navy">
              {member.permission === "add" ? t(lang, "canAdd") : t(lang, "viewOnly")}
            </p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
