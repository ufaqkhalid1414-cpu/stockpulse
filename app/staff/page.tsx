"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Menu } from "@/components/Menu";
import { SuccessPopup } from "@/components/SuccessPopup";
import { Button, Field, Lead } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { formatAdded } from "@/lib/format";
import { t, type CopyKey } from "@/lib/i18n";
import { staffRemoveConfirmMessage } from "@/lib/staff-management";
import { permissionLabelKey } from "@/lib/staff-permission";
import { useStock } from "@/lib/store";
import type { OwnerAccess, Permission } from "@/lib/types";

export default function StaffPage() {
  const {
    state,
    addStaff,
    removeStaff,
    updateStaffPermission,
    addOwner,
    removeOwner,
    role,
    busy,
    error: storeError,
  } = useStock();
  const lang = state.language;
  const isEqualOwner = role === "equal_owner";

  const [staffOpen, setStaffOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);

  const [phone, setPhone] = useState("");
  const [personName, setPersonName] = useState("");
  const [permission, setPermission] = useState<Permission>("view");
  const [staffError, setStaffError] = useState("");
  const [staffNotice, setStaffNotice] = useState("");
  const [actingStaffId, setActingStaffId] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccess>("equal");
  const [ownerError, setOwnerError] = useState("");

  const [showSuccess, setShowSuccess] = useState(false);
  const [successLabel, setSuccessLabel] = useState("");
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  function flashSuccess(label: string) {
    setSuccessLabel(label);
    setShowSuccess(true);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setShowSuccess(false), 1100);
  }

  const staffCount = state.staff.length;
  const owners = state.owners.length > 0
    ? state.owners
    : state.ownerWhatsapp
      ? [
          {
            id: "primary",
            name: "Owner",
            phone: state.ownerWhatsapp,
            access: "equal" as const,
            isPrimary: true,
            addedAt: new Date().toISOString(),
          },
        ]
      : [];

  async function submitStaff(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = personName.trim();
    const trimmed = phone.trim();
    if (!trimmedName) {
      setStaffError(t(lang, "nameRequiredStaff"));
      return;
    }
    if (!trimmed) {
      setStaffError(t(lang, "phoneRequired"));
      return;
    }
    if (state.staff.some((member) => member.phone.replace(/\s/g, "") === trimmed.replace(/\s/g, ""))) {
      setStaffError(t(lang, "phoneDuplicate"));
      return;
    }
    try {
      await addStaff(trimmedName, trimmed, permission);
      setPhone("");
      setPersonName("");
      setPermission("view");
      setStaffError("");
      setStaffOpen(false);
      flashSuccess(t(lang, "personAddedSuccess"));
    } catch {
      /* store error — never show success */
    }
  }

  async function submitOwner(event: React.FormEvent) {
    event.preventDefault();
    if (!isEqualOwner) {
      setOwnerError(t(lang, "coOwnerBlocked"));
      return;
    }
    const trimmedName = ownerName.trim();
    const trimmed = ownerPhone.trim();
    if (!trimmedName) {
      setOwnerError(t(lang, "nameRequiredStaff"));
      return;
    }
    if (!trimmed) {
      setOwnerError(t(lang, "phoneRequired"));
      return;
    }
    try {
      await addOwner(trimmedName, trimmed, ownerAccess);
      setOwnerName("");
      setOwnerPhone("");
      setOwnerAccess("equal");
      setOwnerError("");
      setOwnerOpen(false);
      flashSuccess(t(lang, "personAddedSuccess"));
    } catch {
      /* store error — never show success */
    }
  }

  function staffPermissionLabel(p: Permission) {
    return t(lang, permissionLabelKey(p) as CopyKey);
  }

  async function onChangeStaffPermission(staffId: string, next: Permission) {
    if (busy || actingStaffId) return;
    setActingStaffId(staffId);
    setStaffNotice("");
    try {
      await updateStaffPermission(staffId, next);
      setStaffNotice(t(lang, "staffPermissionSaved"));
      flashSuccess(t(lang, "staffPermissionSaved"));
    } catch {
      /* store error — never show success */
    } finally {
      setActingStaffId(null);
    }
  }

  async function onRemoveStaff(member: { id: string; name: string; phone: string }) {
    if (busy || actingStaffId) return;
    const confirmed = window.confirm(
      t(lang, "removeStaffConfirm", { name: member.name }) || staffRemoveConfirmMessage(member.name, member.phone),
    );
    if (!confirmed) return;
    setActingStaffId(member.id);
    setStaffNotice("");
    try {
      await removeStaff(member.id);
      setStaffNotice(t(lang, "staffRemoved"));
      flashSuccess(t(lang, "staffRemoved"));
    } catch {
      /* store error — never show success */
    } finally {
      setActingStaffId(null);
    }
  }

  return (
    <AppShell>
      <Lead title={t(lang, "peopleTitle")} support={t(lang, "peopleSupport")} />

      <SuccessPopup
        open={showSuccess}
        label={successLabel || t(lang, "personAddedSuccess")}
        onDismiss={() => setShowSuccess(false)}
      />

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">{t(lang, "ownersSection")}</h2>
            <p className="mt-1 text-sm text-navy/60">{t(lang, "ownersSectionSupport")}</p>
          </div>
          {isEqualOwner ? (
            <Button onClick={() => setOwnerOpen(true)}>{t(lang, "addOwner")}</Button>
          ) : null}
        </div>

        {ownerOpen && isEqualOwner ? (
          <form className="card mt-4 space-y-4 p-5 sm:p-6" onSubmit={submitOwner}>
            <Field id="owner-name" label={t(lang, "staffName")}>
              <VoiceInput
                id="owner-name"
                lang={lang}
                value={ownerName}
                onChange={(next) => {
                  setOwnerName(next);
                  if (ownerError) setOwnerError("");
                }}
                placeholder={t(lang, "staffNamePlaceholder")}
                autoComplete="name"
              />
            </Field>
            <Field id="owner-phone" label={t(lang, "whatsapp")} error={ownerError || undefined}>
              <VoiceInput
                id="owner-phone"
                lang={lang}
                value={ownerPhone}
                onChange={(next) => {
                  setOwnerPhone(next);
                  if (ownerError) setOwnerError("");
                }}
                placeholder={t(lang, "whatsappPlaceholder")}
                required
              />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "ownerAccess")}</p>
              <Menu
                label={t(lang, "ownerAccess")}
                value={ownerAccess}
                align="start"
                options={[
                  { value: "equal", label: t(lang, "equalOwner") },
                  { value: "co", label: t(lang, "coOwner") },
                ]}
                onChange={(value) => setOwnerAccess(value as OwnerAccess)}
              />
              <p className="mt-2 text-xs text-navy/55">
                {ownerAccess === "equal" ? t(lang, "equalOwnerHint") : t(lang, "coOwnerHint")}
              </p>
            </div>
            {storeError && ownerOpen ? <p className="text-sm font-medium text-clay">{storeError}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" disabled={busy}>
                {t(lang, "save")}
              </Button>
              <Button variant="secondary" onClick={() => setOwnerOpen(false)}>
                {t(lang, "cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        <ul className="mt-4 space-y-3">
          {owners.map((owner) => (
            <li key={owner.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-navy">{owner.name}</p>
                  <p className="mt-1 text-sm font-bold text-navy" dir="ltr">
                    {owner.phone}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-navy">
                    {owner.access === "equal" ? t(lang, "equalOwner") : t(lang, "coOwner")}
                    {owner.isPrimary ? ` · ${t(lang, "primaryOwner")}` : ""}
                  </p>
                  {!owner.isPrimary ? (
                    <p className="mt-1 text-sm text-navy/60">{formatAdded(owner.addedAt, lang)}</p>
                  ) : null}
                </div>
                {isEqualOwner && !owner.isPrimary ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(t(lang, "removeStaffConfirm", { name: owner.name }))) return;
                      try {
                        await removeOwner(owner.id);
                        setStaffNotice(t(lang, "ownerRemoved"));
                        flashSuccess(t(lang, "ownerRemoved"));
                      } catch {
                        /* store error — never show success */
                      }
                    }}
                  >
                    {t(lang, "removeOwner")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {!isEqualOwner ? (
          <p className="mt-3 text-sm text-navy/55">{t(lang, "coOwnerManageHint")}</p>
        ) : null}
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">{t(lang, "staffSection")}</h2>
            <p className="mt-1 text-sm text-navy/60">
              {staffCount === 0
                ? t(lang, "staffEmptySupport")
                : staffCount === 1
                  ? t(lang, "staffLeadOne")
                  : t(lang, "staffLead", { count: staffCount })}
            </p>
          </div>
          <Button onClick={() => setStaffOpen(true)}>{t(lang, "addStaff")}</Button>
        </div>

        {staffOpen ? (
          <form className="card mt-4 space-y-4 p-5 sm:p-6" onSubmit={submitStaff}>
            <Field
              id="staff-name"
              label={t(lang, "staffName")}
              error={
                staffError && !phone.trim() && !personName.trim()
                  ? staffError
                  : !personName.trim() && staffError === t(lang, "nameRequiredStaff")
                    ? staffError
                    : undefined
              }
            >
              <VoiceInput
                id="staff-name"
                lang={lang}
                value={personName}
                onChange={(next) => {
                  setPersonName(next);
                  if (staffError) setStaffError("");
                }}
                placeholder={t(lang, "staffNamePlaceholder")}
              />
            </Field>
            <Field
              id="phone"
              label={t(lang, "whatsapp")}
              error={staffError && staffError !== t(lang, "nameRequiredStaff") ? staffError : undefined}
            >
              <VoiceInput
                id="phone"
                lang={lang}
                value={phone}
                onChange={(next) => {
                  setPhone(next);
                  if (staffError) setStaffError("");
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
                  { value: "view", label: t(lang, "permView") },
                  { value: "add", label: t(lang, "permAdd") },
                  { value: "sell", label: t(lang, "permSell") },
                  { value: "move", label: t(lang, "permMove") },
                ]}
                onChange={(value) => setPermission(value as Permission)}
              />
            </div>
            {storeError && staffOpen ? <p className="text-sm font-medium text-clay">{storeError}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" disabled={busy}>
                {t(lang, "save")}
              </Button>
              <Button variant="secondary" onClick={() => setStaffOpen(false)}>
                {t(lang, "cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {staffNotice ? <p className="mt-3 text-sm font-medium text-pine">{staffNotice}</p> : null}
        {storeError && !staffOpen && !ownerOpen ? (
          <p className="mt-3 text-sm font-medium text-clay">{storeError}</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {state.staff.map((member) => {
            const rowBusy = busy || actingStaffId === member.id;
            return (
              <li key={member.id} className="card space-y-3 p-5">
                <div>
                  <p className="text-lg font-bold text-navy">{member.name}</p>
                  <p className="mt-1 text-sm font-bold text-navy" dir="ltr">
                    {member.phone}
                  </p>
                  <p className="mt-1 text-sm text-navy/60">{formatAdded(member.addedAt, lang)}</p>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-navy/80">{t(lang, "staffPermissionLabel")}</p>
                  <Menu
                    label={t(lang, "staffPermissionLabel")}
                    value={member.permission}
                    align="start"
                    options={[
                      { value: "view", label: staffPermissionLabel("view") },
                      { value: "add", label: staffPermissionLabel("add") },
                      { value: "sell", label: staffPermissionLabel("sell") },
                      { value: "move", label: staffPermissionLabel("move") },
                    ]}
                    onChange={(value) => {
                      if (value === member.permission || rowBusy) return;
                      void onChangeStaffPermission(member.id, value as Permission);
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={rowBusy}
                  onClick={() => void onRemoveStaff(member)}
                >
                  {rowBusy && actingStaffId === member.id ? t(lang, "staffManaging") : t(lang, "removeStaff")}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
