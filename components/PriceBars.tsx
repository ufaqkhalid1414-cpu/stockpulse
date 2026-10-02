"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatMoney, formatMonth } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import type { PricePoint } from "@/lib/types";

export function PriceBars({
  points,
  lang,
  label,
}: {
  points: PricePoint[];
  lang: Lang;
  label: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...points.map((point) => point.price), 1);
  const lastIndex = points.length - 1;

  return (
    <div role="img" aria-label={label}>
      <div className="flex h-44 items-end gap-2 border-b border-navy/10 sm:gap-3">
        {points.map((point, index) => {
          const height = Math.max(8, (point.price / max) * 160);
          const current = index === lastIndex;
          return (
            <div key={point.month} className="flex h-full flex-1 items-end">
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
                title={`${formatMonth(point.month, lang)} ${formatMoney(point.price)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {points.map((point, index) => (
          <p
            key={point.month}
            className={`flex-1 text-center text-xs sm:text-sm ${
              index === lastIndex ? "font-semibold text-navy" : "text-navy/55"
            }`}
          >
            {formatMonth(point.month, lang)}
          </p>
        ))}
      </div>
    </div>
  );
}
