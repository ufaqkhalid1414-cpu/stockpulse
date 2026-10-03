"use client";

import { LandingPage } from "@/components/LandingPage";
import { useStock } from "@/lib/store";

export default function HomePage() {
  const { ready, authenticated, needsSetup } = useStock();

  if (!ready) return <div className="min-h-dvh bg-cream" />;
  // Gate redirects authenticated users; keep a calm shell while that runs
  if (authenticated && !needsSetup) return <div className="min-h-dvh bg-cream" />;
  if (authenticated && needsSetup) return <div className="min-h-dvh bg-cream" />;

  return <LandingPage />;
}
