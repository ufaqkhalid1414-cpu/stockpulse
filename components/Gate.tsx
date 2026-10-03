"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStock } from "@/lib/store";
import type { AccessRole } from "@/lib/types";

const OWNER_ONLY = ["/dashboard", "/settings", "/staff", "/low-stock"];
const STAFF_BLOCKED_PREFIX = "/prices";

function pathAllowed(pathname: string, role: AccessRole | null) {
  if (!role) return pathname === "/";
  if (role === "equal_owner" || role === "co_owner") return true;
  // Staff
  if (pathname === "/dashboard" || OWNER_ONLY.includes(pathname) || pathname.startsWith(STAFF_BLOCKED_PREFIX)) {
    return false;
  }
  if (role === "staff_view") {
    return pathname === "/items" || pathname === "/";
  }
  // staff_add
  return pathname === "/add-product" || pathname === "/items" || pathname === "/";
}

export function Gate({ children }: { children: React.ReactNode }) {
  const { state, ready, authenticated, needsSetup, role, homePath } = useStock();
  const pathname = usePathname();
  const router = useRouter();
  const onEntry = pathname === "/";

  useEffect(() => {
    if (!ready) return;
    if (!authenticated && !onEntry) {
      router.replace("/");
      return;
    }
    if (authenticated && needsSetup && !onEntry) {
      router.replace("/");
      return;
    }
    if (authenticated && !needsSetup && state.onboarded && onEntry) {
      router.replace(homePath || "/dashboard");
      return;
    }
    if (authenticated && !needsSetup && role && !pathAllowed(pathname, role)) {
      router.replace(homePath || "/");
    }
  }, [ready, authenticated, needsSetup, state.onboarded, onEntry, role, homePath, pathname, router]);

  if (!ready) return <div className="min-h-dvh bg-cream" />;
  if (!authenticated && !onEntry) return <div className="min-h-dvh bg-cream" />;
  if (authenticated && needsSetup && !onEntry) return <div className="min-h-dvh bg-cream" />;
  if (authenticated && !needsSetup && role && !pathAllowed(pathname, role) && !onEntry) {
    return <div className="min-h-dvh bg-cream" />;
  }
  return children;
}
