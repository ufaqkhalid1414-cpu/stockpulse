"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatMoney } from "@/lib/format";
export type EntryBarPoint = {
  id: string;
  /** Short date shown under the bar */
  label: string;
  price: number;
  /** Full tooltip, e.g. "12 Sep Rs 85 per piece" */
  tip: string;
};

export function EntryPriceBars({
  points,
  label,
}: {
  points: EntryBarPoint[];
  label: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...points.map((point) => point.price), 1);
  const lastIndex = points.length - 1;

  if (points.length === 0) {
    return (
      <p className="text-sm text-navy/55" role="status">
        —
      </p>
    );
  }

  return (
    <div role="img" aria-label={label}>
      <div className="flex h-44 items-end gap-2 border-b border-navy/10 sm:gap-3">
        {points.map((point, index) => {
          const height = Math.max(8, (point.price / max) * 160);
          const current = index === lastIndex;
          return (
            <div key={point.id} className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end">
              <motion.div
                className={`w-full rounded-t-md ${current ? "bg-gold" : "bg-navy"}`}
                style={{ height, transformOrigin: "bottom" }}
                initial={reduce ? { scaleY: 1 } : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: reduce ? 0 : 0.45,
                  delay: reduce ? 0 : index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
                title={point.tip}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {points.map((point, index) => (
          <p
            key={point.id}
            className={`min-w-0 flex-1 truncate text-center text-[10px] leading-tight sm:text-xs ${
              index === lastIndex ? "font-semibold text-navy" : "text-navy/55"
            }`}
            title={point.tip}
          >
            <span className="block">{point.label}</span>
            <span className="mt-0.5 block tabular-nums">{formatMoney(point.price)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
