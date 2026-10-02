"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStock } from "@/lib/store";

export function Gate({ children }: { children: React.ReactNode }) {
  const { state, ready, authenticated, needsSetup } = useStock();
  const pathname = usePathname();
  const router = useRouter();
  const onEntry = pathname === "/";

  useEffect(() => {
    if (!ready) return;
    // Not logged in → only entry/login page
    if (!authenticated && !onEntry) {
      router.replace("/");
      return;
    }
    // Logged in but still needs business setup → stay on /
    if (authenticated && needsSetup && !onEntry) {
      router.replace("/");
      return;
    }
    // Fully ready on entry → dashboard
    if (authenticated && !needsSetup && state.onboarded && onEntry) {
      router.replace("/dashboard");
    }
  }, [ready, authenticated, needsSetup, state.onboarded, onEntry, router]);

  if (!ready) return <div className="min-h-dvh bg-cream" />;
  if (!authenticated && !onEntry) return <div className="min-h-dvh bg-cream" />;
  if (authenticated && needsSetup && !onEntry) return <div className="min-h-dvh bg-cream" />;
  return children;
}
