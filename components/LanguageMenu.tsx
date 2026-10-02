"use client";

import { Menu } from "@/components/Menu";
import { languages, t } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function LanguageMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { state, setLanguage } = useStock();
  return (
    <Menu
      label={t(state.language, "language")}
      value={state.language}
      align={align}
      options={languages.map((language) => ({ value: language.id, label: language.label }))}
      onChange={(value) => setLanguage(value as typeof state.language)}
    />
  );
}
