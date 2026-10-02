"use client";

import { Button, Lead } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export default function NotFound() {
  const { state } = useStock();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Lead title={t(state.language, "notFound")} />
      <div className="mt-6">
        <Button href="/dashboard">{t(state.language, "goDashboard")}</Button>
      </div>
    </div>
  );
}
