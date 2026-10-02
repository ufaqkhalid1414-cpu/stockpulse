"use client";

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

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

const SPEECH_LOCALE: Record<Lang, string> = {
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

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      {listening ? (
        <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.2" />
      ) : null}
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

export function VoiceInput({ id, value, onChange, lang, className = "field", disabled, ...rest }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef(value);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || disabled) return;

    recognitionRef.current?.abort();
    const recognition = new Ctor();
    recognition.lang = SPEECH_LOCALE[lang] || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    baseValueRef.current = value;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const spoken = transcript.trim();
      if (!spoken) return;
      const base = baseValueRef.current.trim();
      onChange(base ? `${base} ${spoken}` : spoken);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [disabled, lang, onChange, value]);

  const toggle = () => {
    if (listening) stop();
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
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
      <button
        type="button"
        className={`absolute end-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition ${
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
    </div>
  );
}
