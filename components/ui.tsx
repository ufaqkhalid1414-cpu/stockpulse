"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { markScrollTop } from "@/lib/scroll";

const buttonClass =
  "depth lift inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold";

export function Button({
  children,
  href,
  type = "button",
  variant = "primary",
  onClick,
  className = "",
  full = false,
  disabled = false,
}: {
  children: React.ReactNode;
  href?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  onClick?: () => void;
  className?: string;
  full?: boolean;
  disabled?: boolean;
}) {
  const classNames = [
    buttonClass,
    variant === "primary" ? "bg-navy text-cream" : "border border-navy/20 bg-white text-navy",
    full ? "w-full" : "",
    disabled ? "pointer-events-none opacity-50" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className={classNames}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          markScrollTop();
          onClick?.();
        }}
      >
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classNames} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function AppLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        markScrollTop();
      }}
    >
      {children}
    </Link>
  );
}

export function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 text-pine">
      <path d="M4 10.5 8 14.5 16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Num({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export function StatusBanner({ title, support }: { title: string; support: string }) {
  return (
    <div className="depth rounded-card bg-sage px-5 py-4" role="status">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          <CheckIcon />
        </span>
        <div>
          <p className="text-base font-bold leading-snug text-pine sm:text-lg">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-pine/80">{support}</p>
        </div>
      </div>
    </div>
  );
}

export function Lead({ title, support }: { title: string; support?: string }) {
  return (
    <div role="status">
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-navy sm:text-[1.7rem]">{title}</h1>
      {support ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-navy/70">{support}</p> : null}
    </div>
  );
}

export function BackLabel({ label, fallback }: { label: string; fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="depth lift inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else {
          markScrollTop();
          router.push(fallback, { scroll: false });
        }
      }}
    >
      <span aria-hidden className="inline-block rtl:rotate-180">
        ←
      </span>
      {label}
    </button>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy/80">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-sm text-navy/55">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-sm font-medium text-clay">{error}</p> : null}
    </div>
  );
}
