"use client";

import { createPortal } from "react-dom";

/** Same thumbs-up overlay used after adding a product. */
export function SuccessPopup({
  open,
  label,
  onDismiss,
}: {
  open: boolean;
  label: string;
  onDismiss: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/35 px-5 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={label}
      onClick={onDismiss}
    >
      <div className="depth w-full max-w-sm rounded-card bg-cream px-6 py-8 text-center shadow-[var(--shadow-lift)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage text-pine">
          <ThumbsUpIcon />
        </div>
        <p className="mt-4 text-xl font-bold text-navy">{label}</p>
      </div>
    </button>,
    document.body,
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-pine">
      <path
        d="M7 11v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2Zm0 0V9a3 3 0 0 1 3-3h.5l.7-2.1A2.5 2.5 0 0 1 13.6 2.5L14 2.6a2 2 0 0 1 1.2 2.5L14.5 8H19a2 2 0 0 1 1.9 2.6l-1.2 5A3 3 0 0 1 16.8 18H10a3 3 0 0 1-3-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
