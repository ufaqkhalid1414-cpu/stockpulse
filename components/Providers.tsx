"use client";

import { useEffect } from "react";
import { Gate } from "@/components/Gate";
import { PageTransition } from "@/components/PageTransition";
import { languageById } from "@/lib/i18n";
import { useStock } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreBridge>
      <Gate>
        <PageTransition>{children}</PageTransition>
      </Gate>
    </StoreBridge>
  );
}

function StoreBridge({ children }: { children: React.ReactNode }) {
  const { state } = useStock();

  useEffect(() => {
    const language = languageById(state.language);
    document.documentElement.lang = state.language === "zh" ? "zh-Hans" : state.language;
    document.documentElement.dir = language.dir;
  }, [state.language]);

  return children;
}
