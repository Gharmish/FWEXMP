import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { TrendBadge } from '@/features/admin/dashboard/components/trend-badge';
import type { TrendDirection } from '@/features/admin/dashboard/lib/trends';

interface MetricStatProps {
  label: string;
  value: ReactNode;
  locale: Locale;
  /** Period-over-period growth; omit for a point-in-time figure. */
  growth?: { direction: TrendDirection; deltaPct: number | null };
  newLabel?: string;
  /** Small caption under the value. */
  hint?: string;
}

/**
 * A compact stat for the dashboard's grouped sections — denser than `KpiTile`
 * (no card chrome of its own; meant to sit inside a section card grid). Label,
 * figure, and an optional growth badge. Reuses `TrendBadge` so growth colour
 * and arrows match the hero row.
 */
export function MetricStat({ label, value, locale, growth, newLabel, hint }: MetricStatProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'text-sarat-black-600 text-[11px] font-medium',
          locale === 'en' && 'tracking-[0.2em] uppercase',
        )}
      >
        {label}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
          {value}
        </span>
        {growth && (
          <TrendBadge
            direction={growth.direction}
            deltaPct={growth.deltaPct}
            locale={locale}
            newLabel={newLabel ?? ''}
          />
        )}
      </span>
      {hint && <span className="text-sarat-black-600 text-xs">{hint}</span>}
    </div>
  );
}
