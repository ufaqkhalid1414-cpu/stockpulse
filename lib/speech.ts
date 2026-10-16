import type { Lang } from "@/lib/i18n";
import { languages } from "@/lib/i18n";

/** BCP-47 locales requested from the browser Web Speech API (Chrome/Edge cloud STT). */
export const SPEECH_LOCALE: Record<Lang, string> = {
  en: "en-US",
  ur: "ur-PK",
  zh: "zh-CN",
  de: "de-DE",
  ar: "ar-SA",
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  pt: "pt-BR",
};

/**
 * Verified request mapping vs known Chromium Web Speech language lists.
 * "supported" = locale is commonly listed for Chrome speech recognition.
 * "partial" = we request the locale, but the engine may reject or fall back (notably Urdu).
 * Browser/device can still fail any language (permission, network, embedded Chromium).
 */
export type SpeechSupportStatus = "supported" | "partial";

export type SpeechLangRow = {
  appLang: Lang;
  label: string;
  locale: string;
  status: SpeechSupportStatus;
  note: string;
};

export const SPEECH_LANG_TABLE: SpeechLangRow[] = languages.map((language) => {
  const locale = SPEECH_LOCALE[language.id];
  if (language.id === "ur") {
    return {
      appLang: language.id,
      label: language.label,
      locale,
      status: "partial" as const,
      note: "ur-PK is requested; Chromium lists often omit Urdu — may error or fall back. User can pick another mic language.",
    };
  }
  return {
    appLang: language.id,
    label: language.label,
    locale,
    status: "supported" as const,
    note: "Locale requested via Web Speech API; accuracy depends on Chrome/Edge and device.",
  };
});

export type SpeechLangPreference = Lang | "auto";

export function isSpeechLangPreference(value: string | null | undefined): value is SpeechLangPreference {
  if (value === "auto") return true;
  return languages.some((language) => language.id === value);
}

export function resolveRecognitionLang(appLang: Lang, preference: SpeechLangPreference): Lang {
  if (preference === "auto") return appLang;
  return preference;
}

export function speechLocaleFor(appLang: Lang, preference: SpeechLangPreference = "auto"): string {
  return SPEECH_LOCALE[resolveRecognitionLang(appLang, preference)] ?? SPEECH_LOCALE.en;
}

/** Eastern Arabic-Indic, Persian/Urdu extended, and Devanagari digits → ASCII. */
const UNICODE_DIGIT_MAP: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

export function normalizeUnicodeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९]/g, (ch) => UNICODE_DIGIT_MAP[ch] ?? ch);
}

/**
 * Put recognized speech into a field value.
 * Numeric modes extract the first digit run only — never invent quantities from number words.
 * Unit words (carton/piece) are ignored for numeric extract; the UI unit control stays authoritative.
 */
export function normalizeSpokenValue(spoken: string, inputMode: string | undefined): string {
  const trimmed = spoken.trim();
  if (!trimmed) return "";
  if (inputMode !== "decimal" && inputMode !== "numeric" && inputMode !== "tel") {
    return trimmed;
  }
  const withAsciiDigits = normalizeUnicodeDigits(trimmed);
  if (inputMode === "tel") {
    const tel = withAsciiDigits.replace(/[^\d+]/g, "");
    return tel || trimmed;
  }
  const digits = withAsciiDigits.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return digits?.[0] ?? trimmed;
}

/** True when a numeric field got a usable digit value (not leftover words). */
export function spokenValueHasDigits(value: string): boolean {
  return /-?\d+(?:\.\d+)?/.test(normalizeUnicodeDigits(value));
}
