'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger, formatSAR } from '@/lib/format';
import { SPRING } from '@/components/ui/motion';
import type { SeriesPoint } from '@/features/admin/dashboard/metrics-types';

interface RevenueChartProps {
  points: readonly SeriesPoint[];
  locale: Locale;
  bookingsLabel: string;
  gmvLabel: string;
  /** Shown when the selected range has no revenue activity. */
  emptyLabel: string;
}

/**
 * Range-aware revenue chart: GMV as Juniper-Green bars with the bookings count
 * drawn as an overlaid line (BRIEF §3 nature/success). Dependency-free SVG/CSS
 * — a chart lib is overkill. Bars spring up from the baseline on first view and
 * the line draws itself in (the one Gharmish spring, reduced-motion-safe).
 * Hovering a bar lifts a hairline tooltip with that bucket's figures.
 */
export function RevenueChart({
  points,
  locale,
  bookingsLabel,
  gmvLabel,
  emptyLabel,
}: RevenueChartProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  const maxGmv = Math.max(1, ...points.map((p) => p.gmvSar));
  const maxBookings = Math.max(1, ...points.map((p) => p.bookings));
  const totalGmv = points.reduce((sum, p) => sum + p.gmvSar, 0);
  const totalBookings = points.reduce((sum, p) => sum + p.bookings, 0);
  const n = points.length || 1;

  if (totalGmv === 0 && totalBookings === 0) {
    return (
      <div className="flex h-44 items-center justify-center">
        <p className="text-sarat-black-600 text-sm">{emptyLabel}</p>
      </div>
    );
  }

  // Bookings line in a 0..100 box; leave 6% headroom at the top.
  const lineY = (b: number) => 100 - (b / maxBookings) * 88 - 6;
  const linePoints = points
    .map((p, i) => `${((i + 0.5) / n) * 100},${lineY(p.bookings)}`)
    .join(' ');
  const activePoint = active != null ? points[active] : null;
  const activeLeft = active != null ? ((active + 0.5) / n) * 100 : 0;
  // Keep the tooltip inside the chart: align it to the bar at the edges.
  const tipTranslate =
    activeLeft < 14 ? 'translate-x-0' : activeLeft > 86 ? '-translate-x-full' : '-translate-x-1/2';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex items-center gap-x-5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-juniper-green/85 size-2.5 rounded-sm" aria-hidden />
            <span className="text-sarat-black-600">{gmvLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-sarat-black h-0.5 w-3.5 rounded-full" aria-hidden />
            <span className="text-sarat-black-600">{bookingsLabel}</span>
          </span>
        </div>
        <p
          className="text-sarat-black text-xs font-medium tabular-nums"
          aria-live="polite"
          dir="ltr"
        >
          {activePoint
            ? `${activePoint.bucket} · ${formatSAR(activePoint.gmvSar, locale)} · ${formatInteger(activePoint.bookings, locale)}`
            : `${formatSAR(totalGmv, locale)} · ${formatInteger(totalBookings, locale)}`}
        </p>
      </div>

      <div
        className="relative h-44 w-full"
        onMouseLeave={() => setActive(null)}
        role="img"
        aria-label={`${gmvLabel}: ${formatSAR(totalGmv, locale)} · ${bookingsLabel}: ${formatInteger(totalBookings, locale)}`}
      >
        {/* reference gridlines */}
        {[0, 0.25, 0.5, 0.75].map((g) => (
          <div
            key={g}
            aria-hidden
            className="border-sarat-black/[0.06] absolute inset-x-0 [border-top-width:0.5px]"
            style={{ top: `${g * 100}%` }}
          />
        ))}

        {/* GMV bars */}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {points.map((p, i) => {
            const h = (p.gmvSar / maxGmv) * 94;
            const isActive = active === i;
            return (
              <div
                key={p.bucket}
                className="relative flex h-full flex-1 cursor-default items-end"
                onMouseEnter={() => setActive(i)}
              >
                <motion.div
                  className="bg-juniper-green w-full origin-bottom rounded-t-[3px]"
                  style={{ height: `${h}%`, opacity: p.gmvSar === 0 ? 0.14 : isActive ? 1 : 0.82 }}
                  initial={reduce ? false : { scaleY: 0 }}
                  whileInView={reduce ? undefined : { scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ ...SPRING, delay: reduce ? 0 : Math.min(i * 0.02, 0.4) }}
                />
              </div>
            );
          })}
        </div>

        {/* Bookings line */}
        {points.length > 1 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            <motion.polyline
              points={linePoints}
              fill="none"
              className="stroke-sarat-black"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              whileInView={reduce ? undefined : { pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ ...SPRING, delay: 0.1 }}
            />
          </svg>
        )}

        {/* active marker on the line */}
        {activePoint && (
          <span
            aria-hidden
            className="border-sarat-black pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full [border-width:1.5px] bg-white"
            style={{ left: `${activeLeft}%`, top: `${lineY(activePoint.bookings)}%` }}
          />
        )}

        {/* hover tooltip */}
        {activePoint && (
          <div
            className={cn(
              'rounded-input border-sarat-black/10 pointer-events-none absolute bottom-full z-20 mb-2',
              '[border-width:0.5px] bg-white px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-[var(--shadow-overlay)]',
              tipTranslate,
            )}
            style={{ left: `${activeLeft}%` }}
            dir="ltr"
          >
            <span className="text-sarat-black-600">{activePoint.bucket}</span>
            <span className="text-sarat-black ms-2 font-medium tabular-nums">
              {formatSAR(activePoint.gmvSar, locale)} ·{' '}
              {formatInteger(activePoint.bookings, locale)}
            </span>
          </div>
        )}
      </div>

      <div className="text-sarat-black-600 flex justify-between text-xs">
        <span dir="ltr">{points[0]?.bucket ?? '—'}</span>
        <span dir="ltr">{points[points.length - 1]?.bucket ?? '—'}</span>
      </div>
    </div>
  );
}
