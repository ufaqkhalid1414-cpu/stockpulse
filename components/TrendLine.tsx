"use client";

import { motion, useReducedMotion } from "framer-motion";

export function TrendLine({ values, label }: { values: number[]; label: string }) {
  const reduce = useReducedMotion();
  const width = 320;
  const height = 72;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[72px] w-full" role="img" aria-label={label}>
      <motion.path
        d={area}
        fill="#D9A947"
        fillOpacity={0.14}
        initial={reduce ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.4 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="#D9A947"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r="3.5"
        fill="#D9A947"
        initial={reduce ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 0.7, duration: 0.2 }}
      />
    </svg>
  );
}

function smoothPath(points: readonly (readonly [number, number])[]) {
  const [first, ...rest] = points;
  let path = `M ${first[0]} ${first[1]}`;
  rest.forEach((point, index) => {
    const previous = index === 0 ? first : rest[index - 1];
    const controlX = (previous[0] + point[0]) / 2;
    path += ` C ${controlX} ${previous[1]}, ${controlX} ${point[1]}, ${point[0]} ${point[1]}`;
  });
  return path;
}
