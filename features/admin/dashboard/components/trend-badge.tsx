import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import type { TrendDirection } from '@/features/admin/dashboard/lib/trends';

interface TrendBadgeProps {
  direction: TrendDirection;
  /** Percent change vs the prior period, or null when undefined. */
  deltaPct: number | null;
  locale: Locale;
  /** Rendered when `deltaPct` is null and the metric grew from zero (e.g. "New"). */
  newLabel: string;
}

const ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
} as const;

/**
 * Compact period-over-period delta — arrow + percentage. Up reads
 * juniper-green (success), down al-qatt-red (error/attention), flat neutral
 * (BRIEF §3 palette). The arrow mirrors horizontally in RTL so "up and
 * forward" stays forward. Nothing renders for an undefined flat trend.
 */
export function TrendBadge({ direction, deltaPct, locale, newLabel }: TrendBadgeProps) {
  if (deltaPct === null && direction === 'flat') return null;

  const Icon = ICON[direction];
  const text =
    deltaPct === null ? newLabel : `${deltaPct > 0 ? '+' : ''}${formatInteger(deltaPct, locale)}%`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium tabular-nums',
        direction === 'up' && 'text-juniper-green',
        direction === 'down' && 'text-al-qatt-red',
        direction === 'flat' && 'text-sarat-black-600',
      )}
    >
      <Icon className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
      {text}
    </span>
  );
}
