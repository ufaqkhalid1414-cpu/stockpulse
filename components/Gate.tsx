"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStock } from "@/lib/store";
import type { AccessRole } from "@/lib/types";

const OWNER_ONLY = ["/dashboard", "/settings", "/staff", "/low-stock"];
const STAFF_BLOCKED_PREFIX = "/prices";
const PUBLIC = ["/", "/login"];

function pathAllowed(pathname: string, role: AccessRole | null) {
  if (!role) return PUBLIC.includes(pathname);
  if (role === "equal_owner" || role === "co_owner") return true;
  if (pathname === "/dashboard" || OWNER_ONLY.includes(pathname) || pathname.startsWith(STAFF_BLOCKED_PREFIX)) {
    return false;
  }
  if (role === "staff_view") {
    return pathname === "/items" || PUBLIC.includes(pathname);
  }
  return pathname === "/add-product" || pathname === "/items" || PUBLIC.includes(pathname);
}

export function Gate({ children }: { children: React.ReactNode }) {
  const { state, ready, authenticated, needsSetup, role, homePath } = useStock();
  const pathname = usePathname();
  const router = useRouter();
  const onPublic = PUBLIC.includes(pathname);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated && !onPublic) {
      router.replace("/");
      return;
    }
    if (authenticated && needsSetup && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (authenticated && !needsSetup && state.onboarded && onPublic) {
      router.replace(homePath || "/dashboard");
      return;
    }
    if (authenticated && !needsSetup && role && !pathAllowed(pathname, role)) {
      router.replace(homePath || "/");
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
