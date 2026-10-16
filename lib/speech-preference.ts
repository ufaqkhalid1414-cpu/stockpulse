"use client";

import type { Lang } from "@/lib/i18n";
import { isSpeechLangPreference, type SpeechLangPreference } from "@/lib/speech";

const STORAGE_KEY = "stockpulse-speech-lang";
const CHANGE_EVENT = "stockpulse-speech-lang-change";

export function getSpeechLangPreference(): SpeechLangPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isSpeechLangPreference(raw)) return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return "auto";
}

export function setSpeechLangPreference(value: SpeechLangPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

export function subscribeSpeechLangPreference(listener: (value: SpeechLangPreference) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    listener(isSpeechLangPreference(event.newValue) ? event.newValue : "auto");
  };
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<SpeechLangPreference>).detail;
    listener(isSpeechLangPreference(detail) ? detail : getSpeechLangPreference());
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onCustom);
  };
}

export function recognitionLangForApp(appLang: Lang): Lang {
  const preference = getSpeechLangPreference();
  return preference === "auto" ? appLang : preference;
}
