"use client";

import { Suspense } from "react";
import { AuthEntry } from "@/components/AuthEntry";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <AuthEntry />
    </Suspense>
  );
}
