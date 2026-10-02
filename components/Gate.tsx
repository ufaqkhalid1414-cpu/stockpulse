"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStock } from "@/lib/store";

export function Gate({ children }: { children: React.ReactNode }) {
  const { state, ready } = useStock();
  const pathname = usePathname();
  const router = useRouter();
  const onSetup = pathname === "/";

  useEffect(() => {
    if (!ready) return;
    if (!state.onboarded && !onSetup) router.replace("/");
    if (state.onboarded && onSetup) router.replace("/dashboard");
  }, [ready, state.onboarded, onSetup, router]);

  if (!ready) return <div className="min-h-dvh bg-cream" />;
  if (!state.onboarded && !onSetup) return <div className="min-h-dvh bg-cream" />;
  return children;
}
