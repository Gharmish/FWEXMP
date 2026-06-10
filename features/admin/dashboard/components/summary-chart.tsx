import type { Locale } from '@/lib/i18n';
import { Price } from '@/components/ui/price';
import { formatInteger } from '@/lib/format';
import type { SparklinePoint } from '@/features/admin/analytics/types';

interface SummaryChartProps {
  points: readonly SparklinePoint[];
  locale: Locale;
}

/**
 * Inline SVG bar chart — one bar per day, height scaled to peak bookings.
 * Deliberately dependency-free: a chart library is overkill for 30 numbers,
 * and Tailwind + SVG ages better than a third-party dep. No shadow; the bars
 * use Juniper Green (BRIEF §3 success/nature). Shared by the dashboard
 * "Summary" widget and the analytics page.
 */
export function SummaryChart({ points, locale }: SummaryChartProps) {
  const max = Math.max(1, ...points.map((p) => p.bookings));
  const width = 100;
  const height = 24;
  const barWidth = points.length > 0 ? width / points.length : width;
  const totalGmv = points.reduce((sum, p) => sum + p.gmvSar, 0);
  const totalBookings = points.reduce((sum, p) => sum + p.bookings, 0);

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily bookings over ${points.length} days — ${formatInteger(totalBookings, locale)} total`}
        className="text-juniper-green h-24 w-full"
      >
        {points.map((p, i) => {
          const h = (p.bookings / max) * height;
          return (
            <rect
              key={p.date}
              x={i * barWidth + 0.5}
              y={height - h}
              width={Math.max(0.5, barWidth - 1)}
              height={h}
              fill="currentColor"
              opacity={p.bookings === 0 ? 0.15 : 0.85}
            >
              <title>{`${p.date}: ${p.bookings} booking${p.bookings === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="text-sarat-black-600 flex justify-between text-xs">
        <span dir="ltr">{points[0]?.date ?? '—'}</span>
        <span className="inline-flex items-baseline gap-1">
          {formatInteger(totalBookings, locale)} · <Price amount={totalGmv} locale={locale} />
        </span>
        <span dir="ltr">{points[points.length - 1]?.date ?? '—'}</span>
      </div>
    </div>
  );
}
