import type { ReactNode } from 'react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { TrendBadge } from '@/features/admin/dashboard/components/trend-badge';
import type { TrendDirection } from '@/features/admin/dashboard/lib/trends';

interface KpiTileProps {
  label: string;
  /** The headline figure — a `<Price>` or formatted integer string. */
  value: ReactNode;
  locale: Locale;
  href?: string;
  trend?: { direction: TrendDirection; deltaPct: number | null; newLabel: string };
  /** Small caption under the value (e.g. "last 30 days"). */
  hint?: string;
}

/**
 * One KPI in the dashboard headline row: eyebrow label, large figure, and an
 * optional period-over-period trend. A hairline card (no shadow, BRIEF §3);
 * when `href` is set the whole tile is a link with the standard border-hover.
 */
export function KpiTile({ label, value, locale, href, trend, hint }: KpiTileProps) {
  const eyebrow = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'uppercase tracking-[0.2em]',
  );

  const inner = (
    <>
      <span className={eyebrow}>{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-3xl font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </span>
        {trend && (
          <TrendBadge
            direction={trend.direction}
            deltaPct={trend.deltaPct}
            locale={locale}
            newLabel={trend.newLabel}
          />
        )}
      </span>
      {hint && <span className="text-sarat-black-600 text-xs">{hint}</span>}
    </>
  );

  const cardClass =
    'border-sarat-black/8 rounded-card flex h-full flex-col gap-2 [border-width:0.5px] p-6';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(cardClass, 'hover:border-sarat-black/20 transition-colors duration-200')}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
