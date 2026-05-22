import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import type { ReviewAggregate } from '@/features/reviews/types';

interface RatingSummaryProps {
  aggregate: ReviewAggregate;
  locale: Locale;
}

/**
 * Aggregate rating block: large average + 1-5 distribution bars.
 * Server component — pure data in, no interactivity.
 *
 * Stars are Lucide outlines per BRIEF §3 ("outline style only. Never
 * filled icons."). The filled half is rendered by clipping the same
 * outline icon to a width — preserves the outline aesthetic while
 * still communicating the rating fill.
 */
export function RatingSummary({ aggregate, locale }: RatingSummaryProps) {
  const t = useTranslations('reviews');
  const { count, average, distribution } = aggregate;

  if (count === 0 || average === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sarat-black-600 text-base">{t('noReviews')}</p>
      </div>
    );
  }

  const averageDisplay = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average);

  const fillPercent = (average / 5) * 100;
  const buckets: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-12">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-medium tracking-[-0.035em]">
            {averageDisplay}
          </span>
          <span className="text-sarat-black-600 text-base">{t('outOf', { max: 5 })}</span>
        </div>

        {/* Stars: outline row underneath; outline row clipped on top for the
            fill amount. Direction-aware: in RTL we anchor the clip to the
            start (right) so the fill grows from the right. */}
        <div className="relative w-fit" aria-hidden>
          <div className="text-sarat-black/20 flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-5" />
            ))}
          </div>
          <div
            className="text-saffron-gold absolute inset-y-0 start-0 flex gap-1 overflow-hidden"
            style={{ width: `${fillPercent}%` }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-5 shrink-0" />
            ))}
          </div>
        </div>

        <p className="text-sarat-black-600 text-sm">
          {t('basedOn', { count: formatInteger(count, locale) })}
        </p>
      </div>

      <ul className="flex w-full max-w-sm flex-col gap-1.5">
        {buckets.map((bucket) => {
          const n = distribution[bucket];
          const pct = count === 0 ? 0 : (n / count) * 100;
          return (
            <li key={bucket} className="flex items-center gap-3 text-sm">
              <span className="text-sarat-black-600 w-3 text-end tabular-nums">{bucket}</span>
              <Star className="text-sarat-black-600 size-3.5 shrink-0" aria-hidden />
              <span
                className="bg-sarat-black/8 relative h-1.5 flex-1 overflow-hidden rounded-full"
                aria-hidden
              >
                <span
                  className={cn(
                    'bg-saffron-gold absolute inset-y-0 start-0 block rounded-full',
                    pct === 0 && 'opacity-0',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-sarat-black-600 w-6 text-end tabular-nums">
                {formatInteger(n, locale)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
