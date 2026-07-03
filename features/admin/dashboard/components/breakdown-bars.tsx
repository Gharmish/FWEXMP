'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';

export interface BreakdownRow {
  id: string;
  label: string;
  /** Drives the bar width (relative to the largest row). */
  magnitude: number;
  /** Rendered at the end of the row (e.g. a `<Price>` or a count). */
  display: ReactNode;
  /** Tailwind bg utility for the fill; defaults to a neutral dark bar. */
  colorClass?: string;
}

interface BreakdownBarsProps {
  rows: readonly BreakdownRow[];
  emptyLabel: string;
}

/**
 * Horizontal proportional bars for a categorical breakdown (GMV by category,
 * payment-method mix, …). Bars scale to the largest row and spring out from the
 * inline-start on first view (the one Gharmish spring, reduced-motion-safe).
 * Shadowless mist track, brand-token fill (BRIEF §3).
 */
export function BreakdownBars({ rows, emptyLabel }: BreakdownBarsProps) {
  const reduce = useReducedMotion();
  if (rows.length === 0) {
    return <p className="text-sarat-black-600 text-sm">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.magnitude));

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row, i) => {
        const pct = Math.round((row.magnitude / max) * 100);
        return (
          <li key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-sarat-black truncate font-medium">{row.label}</span>
              <span className="text-sarat-black-600 shrink-0 tabular-nums">{row.display}</span>
            </div>
            <div className="bg-mist-deep h-2 w-full overflow-hidden rounded-full">
              <motion.div
                className={cn(
                  'h-full origin-left rounded-full rtl:origin-right',
                  row.colorClass ?? 'bg-sarat-black',
                )}
                style={{ width: `${pct}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                whileInView={reduce ? undefined : { scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ ...SPRING, delay: Math.min(i * 0.05, 0.5) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
