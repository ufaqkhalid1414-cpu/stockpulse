"use client";

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import {
  normalizeSpokenValue,
  speechLocaleFor,
  spokenValueHasDigits,
  type SpeechLangPreference,
} from "@/lib/speech";
import {
  getSpeechLangPreference,
  subscribeSpeechLangPreference,
} from "@/lib/speech-preference";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Cursor / Electron / embedded Chromium often expose the API but Google speech always returns "network". */
function isEmbeddedBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /\bElectron\b/i.test(ua) || /\bCursor\b/i.test(ua);
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      {listening ? <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.2" /> : null}
      <path
        d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 11a5 5 0 0 0 10 0M12 16v4M9 20h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type VoiceInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id"> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  lang: Lang;
};

export function VoiceInput({
  id,
  value,
  onChange,
  lang,
  className = "field",
  disabled,
  inputMode,
  ...rest
}: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [speechPref, setSpeechPref] = useState<SpeechLangPreference>("auto");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /** User wants the mic on — stay listening until they tap stop. */
  const wantListeningRef = useRef(false);
  const baseValueRef = useRef(value);
  const sessionFinalRef = useRef("");
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const langRef = useRef(lang);
  const inputModeRef = useRef(inputMode);
  const speechPrefRef = useRef<SpeechLangPreference>("auto");
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onChangeRef.current = onChange;
  valueRef.current = value;
  langRef.current = lang;
  inputModeRef.current = inputMode;
  speechPrefRef.current = speechPref;

  useEffect(() => {
    setSpeechPref(getSpeechLangPreference());
    return subscribeSpeechLangPreference(setSpeechPref);
  }, []);

  useEffect(() => {
    const hasApi = Boolean(getSpeechRecognition());
    const secure = typeof window !== "undefined" && window.isSecureContext;
    const embedded = isEmbeddedBrowser();
    setSupported(hasApi && secure && !embedded);
    if (!secure) setStatus(t(lang, "voiceNeedsSecure"));
    else if (embedded) setStatus(t(lang, "voiceUseChrome"));
  }, [lang]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const applyTranscript = useCallback((sessionText: string) => {
    const spoken = normalizeSpokenValue(sessionText, inputModeRef.current);
    if (!spoken) return;
    const mode = inputModeRef.current;
    if (mode === "decimal" || mode === "numeric") {
      onChangeRef.current(spoken);
      if (!spokenValueHasDigits(spoken)) {
        setStatus(t(langRef.current, "voiceCheckNumber"));
      } else {
        setStatus(null);
      }
      return;
    }
    const base = baseValueRef.current.trim();
    onChangeRef.current(base ? `${base} ${spoken}` : spoken);
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || disabled || !wantListeningRef.current) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus(t(langRef.current, "voiceNeedsSecure"));
      wantListeningRef.current = false;
      setListening(false);
      return;
    }
    if (isEmbeddedBrowser()) {
      setStatus(t(langRef.current, "voiceUseChrome"));
      wantListeningRef.current = false;
      setListening(false);
      return;
    }

    setStatus(null);
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = speechLocaleFor(langRef.current, speechPrefRef.current);
    // Keep listening across pauses until the user taps the mic again.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    baseValueRef.current = valueRef.current;
    sessionFinalRef.current = "";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interim = "";
      let finals = sessionFinalRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finals = `${finals} ${piece}`.replace(/\s+/g, " ").trim();
          sessionFinalRef.current = finals;
        } else {
          interim += piece;
        }
      }
      const combined = `${finals} ${interim}`.replace(/\s+/g, " ").trim();
      applyTranscript(combined);
    };

    recognition.onerror = (event) => {
      const code = event.error || "";
      if (code === "aborted") return;
      if (code === "no-speech") {
        // Stay armed — continuous sessions often fire no-speech between phrases.
        setStatus(t(langRef.current, "voiceNoSpeech"));
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
        setStatus(t(langRef.current, "voicePermissionDenied"));
        return;
      }
      if (code === "language-not-supported") {
        const preferred = speechPrefRef.current;
        const requested = speechLocaleFor(langRef.current, preferred);
        if (requested !== "en-US") {
          try {
            recognition.lang = "en-US";
            recognition.start();
            setListening(true);
            setStatus(t(langRef.current, "voiceEnglishFallback"));
            return;
          } catch {
            /* fall through */
          }
        }
        wantListeningRef.current = false;
        setListening(false);
        setStatus(t(langRef.current, "voiceLanguageUnsupported"));
        return;
      }
      if (code === "network") {
        wantListeningRef.current = false;
        setListening(false);
        setStatus(t(langRef.current, "voiceNetwork"));
        return;
      }
      // Other errors: keep wanting listen; onend will try restart.
      setStatus(t(langRef.current, "voiceFailed"));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!wantListeningRef.current) {
        setListening(false);
        return;
      }
      // Browser ended the session (common after a pause) — restart until user stops.
      baseValueRef.current = valueRef.current;
      sessionFinalRef.current = "";
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!wantListeningRef.current) return;
        try {
          startRecognition();
        } catch {
          wantListeningRef.current = false;
          setListening(false);
          setStatus(t(langRef.current, "voiceFailed"));
        }
      }, 250);
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      // Already started — ignore; otherwise surface failure.
      if (!wantListeningRef.current) return;
      setListening(false);
      wantListeningRef.current = false;
      setStatus(t(langRef.current, "voiceFailed"));
    }
  }, [disabled, applyTranscript]);

  const start = useCallback(() => {
    wantListeningRef.current = true;
    startRecognition();
  }, [startRecognition]);

  const toggle = () => {
    if (listening || wantListeningRef.current) stop();
    else start();
  };

  const label = !supported
    ? t(lang, "voiceUnsupported")
    : listening
      ? t(lang, "voiceListening")
      : t(lang, "voiceSpeak");

  return (
    <div className="relative">
      <input
        id={id}
        className={`${className} pe-12`}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        dir={inputMode === "tel" || inputMode === "decimal" || inputMode === "numeric" ? "ltr" : undefined}
        {...rest}
      />
      <button
        type="button"
        className={`absolute end-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition ${
          listening ? "bg-clay text-cream" : "text-navy/70 hover:bg-navy/5"
        } ${!supported || disabled ? "pointer-events-none opacity-40" : ""}`}
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-pressed={listening}
        disabled={!supported || disabled}
      >
        <MicIcon listening={listening} />
      </button>
      {status ? (
        <p className="mt-1.5 text-sm text-clay" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
