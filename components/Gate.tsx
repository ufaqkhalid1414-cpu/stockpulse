"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStock } from "@/lib/store";
import {
  isPublicPath,
  pathAllowed,
  shouldBounceAuthenticatedFromPublic,
} from "@/lib/route-access";

export function Gate({ children }: { children: React.ReactNode }) {
  const { state, ready, authenticated, needsSetup, role, homePath } = useStock();
  const pathname = usePathname();
  const router = useRouter();
  const onPublic = isPublicPath(pathname);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated && !onPublic) {
      router.replace("/login");
      return;
    }
    if (authenticated && needsSetup && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (authenticated && !needsSetup && state.onboarded && shouldBounceAuthenticatedFromPublic(pathname)) {
      router.replace(homePath || "/dashboard");
      return;
    }
    if (authenticated && !needsSetup && role && !pathAllowed(pathname, role)) {
      router.replace(homePath || "/dashboard");
    }
  }, [ready, authenticated, needsSetup, state.onboarded, onPublic, role, homePath, pathname, router]);

  if (!ready) return <div className="min-h-dvh bg-cream" />;
  if (!authenticated && !onPublic) return <div className="min-h-dvh bg-cream" />;
  if (authenticated && needsSetup && pathname !== "/login") return <div className="min-h-dvh bg-cream" />;
  if (authenticated && !needsSetup && role && !pathAllowed(pathname, role) && !onPublic) {
    return <div className="min-h-dvh bg-cream" />;
  }
  return children;
}
