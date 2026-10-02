"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

export type MenuOption = {
  value: string;
  label: string;
};

const FOLLOW = 0.22;
const ROW = 40;
const PAD = 6;

export function Menu({
  value,
  options,
  onChange,
  align = "start",
  label,
}: {
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const target = useRef(PAD);
  const current = useRef(PAD);
  const frame = useRef(0);
  const following = useRef(false);
  const reduce = useReducedMotion();
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      cancelAnimationFrame(frame.current);
      following.current = false;
      return;
    }
    const tick = () => {
      const ease = reduce ? 1 : FOLLOW;
      const delta = target.current - current.current;
      current.current = Math.abs(delta) < 0.35 ? target.current : current.current + delta * ease;
      if (highlightRef.current) {
        highlightRef.current.style.transform = `translate3d(0, ${current.current}px, 0)`;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [open, reduce]);

  function placeHighlight(clientY: number, reveal: boolean) {
    const panel = panelRef.current;
    const highlight = highlightRef.current;
    if (!panel || !highlight) return;
    const rect = panel.getBoundingClientRect();
    const localY = clientY - rect.top + panel.scrollTop;
    const max = Math.max(PAD, panel.scrollHeight - PAD - ROW);
    const next = Math.min(max, Math.max(PAD, localY - ROW / 2));
    target.current = next;
    if (!following.current) {
      following.current = true;
      current.current = next;
      highlight.style.transform = `translate3d(0, ${next}px, 0)`;
      if (reveal) {
        requestAnimationFrame(() => {
          if (highlightRef.current) highlightRef.current.style.opacity = "1";
        });
      }
    }
  }

  return (
    <div ref={rootRef} className="relative z-50">
      <button
        type="button"
        className="depth lift inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-navy"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span>{selected?.label}</span>
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <path
            d="M2.5 4.5 6 8 9.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            aria-label={label}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`card absolute z-50 mt-2 max-h-[70vh] w-max min-w-[15.5rem] max-w-[calc(100vw-2.5rem)] overflow-auto ${
              align === "end" ? "end-0" : "start-0"
            }`}
          >
            <div
              ref={panelRef}
              className="relative p-1.5"
              onPointerMove={(event) => {
                if (event.pointerType === "touch") return;
                placeHighlight(event.clientY, true);
              }}
              onPointerLeave={() => {
                following.current = false;
                if (highlightRef.current) highlightRef.current.style.opacity = "0";
              }}
            >
              <div ref={highlightRef} className="menu-highlight" data-testid="menu-highlight" />
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`relative z-10 flex h-10 w-full items-center rounded-[10px] px-3 text-start text-sm ${
                      isSelected ? "font-semibold text-navy" : "font-medium text-navy/80"
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <span className="ms-auto text-navy" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
