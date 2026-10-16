import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { languages, languageById, t, type Lang } from "@/lib/i18n";
import {
  SPEECH_LANG_TABLE,
  SPEECH_LOCALE,
  isSpeechLangPreference,
  normalizeSpokenValue,
  normalizeUnicodeDigits,
  resolveRecognitionLang,
  speechLocaleFor,
  spokenValueHasDigits,
} from "@/lib/speech";

const ALL_LANGS = languages.map((language) => language.id);

describe("Prompt 28 — languages and translation fallback", () => {
  test("dropdown lists exactly the nine app languages with RTL for Urdu and Arabic", () => {
    assert.deepEqual(ALL_LANGS, ["en", "ur", "zh", "de", "ar", "es", "fr", "hi", "pt"]);
    assert.equal(languageById("ur").dir, "rtl");
    assert.equal(languageById("ar").dir, "rtl");
    assert.equal(languageById("en").dir, "ltr");
    assert.equal(languageById("hi").dir, "ltr");
  });

  test("missing translation keys fall back to English without throwing", () => {
    for (const lang of ALL_LANGS) {
      const value = t(lang, "voiceSpeak");
      assert.ok(typeof value === "string" && value.length > 0, `${lang} voiceSpeak`);
    }
    assert.equal(t("en", "voiceLanguageSame"), "Same as app language");
  });

  test("new voice preference copy exists in English and Urdu", () => {
    assert.match(t("en", "voiceLanguage"), /voice/i);
    assert.match(t("ur", "voiceLanguage"), /آواز/);
    assert.match(t("en", "voiceCheckNumber"), /Check the number/);
    assert.match(t("ur", "voiceLanguageUrduNote"), /اردو/);
  });
});

describe("Prompt 28 — speech locale mapping for every dropdown language", () => {
  test("every app language has an explicit speech locale and support status", () => {
    assert.equal(SPEECH_LANG_TABLE.length, ALL_LANGS.length);
    for (const lang of ALL_LANGS) {
      assert.ok(SPEECH_LOCALE[lang], `${lang} locale`);
      const row = SPEECH_LANG_TABLE.find((entry) => entry.appLang === lang);
      assert.ok(row, `${lang} table row`);
      assert.ok(row!.status === "supported" || row!.status === "partial");
      assert.equal(row!.locale, SPEECH_LOCALE[lang]);
    }
  });

  test("Urdu is marked partial; other listed languages are supported for request mapping", () => {
    const urdu = SPEECH_LANG_TABLE.find((row) => row.appLang === "ur");
    assert.equal(urdu?.status, "partial");
    assert.equal(urdu?.locale, "ur-PK");
    for (const row of SPEECH_LANG_TABLE) {
      if (row.appLang === "ur") continue;
      assert.equal(row.status, "supported", row.appLang);
    }
  });

  test("auto preference follows app language; explicit override wins", () => {
    assert.equal(resolveRecognitionLang("ur", "auto"), "ur");
    assert.equal(resolveRecognitionLang("ur", "hi"), "hi");
    assert.equal(speechLocaleFor("ur", "auto"), "ur-PK");
    assert.equal(speechLocaleFor("ur", "hi"), "hi-IN");
    assert.equal(speechLocaleFor("zh", "auto"), "zh-CN");
    assert.equal(speechLocaleFor("ar", "en"), "en-US");
  });

  test("preference guard accepts auto and every Lang", () => {
    assert.equal(isSpeechLangPreference("auto"), true);
    for (const lang of ALL_LANGS) {
      assert.equal(isSpeechLangPreference(lang), true);
    }
    assert.equal(isSpeechLangPreference("xx"), false);
    assert.equal(isSpeechLangPreference(null), false);
  });
});

describe("Prompt 28 — spoken quantity parsing", () => {
  test("extracts Western digits for numeric fields", () => {
    assert.equal(normalizeSpokenValue("12", "decimal"), "12");
    assert.equal(normalizeSpokenValue("about 3.5 cartons", "decimal"), "3.5");
    assert.equal(normalizeSpokenValue("2 pieces", "numeric"), "2");
  });

  test("converts Urdu/Arabic/Devanagari digits without inventing number words", () => {
    assert.equal(normalizeUnicodeDigits("۱۲"), "12");
    assert.equal(normalizeSpokenValue("۱۲", "numeric"), "12");
    assert.equal(normalizeSpokenValue("٤٥", "decimal"), "45");
    assert.equal(normalizeSpokenValue("५०", "numeric"), "50");
    // Number words are left for the user to correct — never silently guessed.
    assert.equal(normalizeSpokenValue("twelve", "numeric"), "twelve");
    assert.equal(spokenValueHasDigits("twelve"), false);
    assert.equal(spokenValueHasDigits("۱۲"), true);
  });

  test("non-numeric fields keep full transcript; tel strips to digits/plus", () => {
    assert.equal(normalizeSpokenValue("blue shirt", undefined), "blue shirt");
    assert.equal(normalizeSpokenValue("+92 300 1234567", "tel"), "+923001234567");
  });

  test("carton vs piece: amount extract ignores unit words; UI unit stays separate", () => {
    assert.equal(normalizeSpokenValue("3 cartons", "decimal"), "3");
    assert.equal(normalizeSpokenValue("10 pieces", "numeric"), "10");
    assert.equal(normalizeSpokenValue("carton", "decimal"), "carton");
  });
});

describe("Prompt 28 — RTL direction metadata", () => {
  test("languageById drives document direction for RTL languages", () => {
    const rtl: Lang[] = ["ur", "ar"];
    for (const lang of rtl) {
      assert.equal(languageById(lang).dir, "rtl");
    }
    for (const lang of ALL_LANGS.filter((id) => !rtl.includes(id))) {
      assert.equal(languageById(lang).dir, "ltr");
    }
  });
});
