"use client";

import { useEffect, useState } from "react";
import { Menu } from "@/components/Menu";
import { languages, t } from "@/lib/i18n";
import type { SpeechLangPreference } from "@/lib/speech";
import {
  getSpeechLangPreference,
  setSpeechLangPreference,
  subscribeSpeechLangPreference,
} from "@/lib/speech-preference";
import { useStock } from "@/lib/store";

export function SpeechLanguageMenu({ align = "start" }: { align?: "start" | "end" }) {
  const { state } = useStock();
  const lang = state.language;
  const [value, setValue] = useState<SpeechLangPreference>("auto");

  useEffect(() => {
    setValue(getSpeechLangPreference());
    return subscribeSpeechLangPreference(setValue);
  }, []);

  const options = [
    { value: "auto", label: t(lang, "voiceLanguageSame") },
    ...languages.map((language) => ({ value: language.id, label: language.label })),
  ];

  return (
    <Menu
      label={t(lang, "voiceLanguage")}
      value={value}
      align={align}
      options={options}
      onChange={(next) => {
        const preference = next as SpeechLangPreference;
        setValue(preference);
        setSpeechLangPreference(preference);
      }}
    />
  );
}
