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
 * Rating stars are solid saffron-gold (`fill-current`). The partial fill is
 * rendered by stacking two rows of the same icon — a muted row underneath and
 * a gold row clipped to the fill width on top — so a fractional average reads
 * as a partially-filled star. Direction-aware: the clip anchors to the start.
 */
export function RatingSummary({ aggregate, locale }: RatingSummaryProps) {
  const t = useTranslations('reviews');
  const { count, average, distribution } = aggregate;

  if (count === 0 || average === null) {
    return (
      <div className="border-sarat-black/8 rounded-card flex flex-col items-center gap-3 [border-width:0.5px] px-6 py-10 text-center">
        <div className="text-sarat-black/20 flex gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-5 fill-current" />
          ))}
        </div>
        <p className="text-base font-medium">{t('emptyTitle')}</p>
        <p className="text-sarat-black-600 max-w-md text-sm leading-relaxed">{t('emptyBody')}</p>
      </div>
    );
  }

  const averageDisplay = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    numberingSystem: 'latn',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average);

  const fillPercent = (average / 5) * 100;
  const buckets: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];
  // A distribution drawn against one or two reviews is four empty rows —
  // it advertises how few reviews exist instead of summarizing them.
  // Hide the histogram until the sample says something.
  const showDistribution = count >= 5;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-12">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-semibold tracking-[-0.035em]">
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
              <Star key={i} className="size-5 fill-current" />
            ))}
          </div>
          <div
            className="text-saffron-gold absolute inset-y-0 start-0 flex gap-1 overflow-hidden"
            style={{ width: `${fillPercent}%` }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-5 shrink-0 fill-current" />
            ))}
          </div>
        </div>

        <p className="text-sarat-black-600 text-sm">
          {/* `n` (raw) drives the ICU plural; `count` stays the latn-digit
              formatted string so Arabic never renders Arabic-Indic digits. */}
          {t('basedOn', { n: count, count: formatInteger(count, locale) })}
        </p>
      </div>

      {showDistribution && (
        <ul className="flex w-full max-w-sm flex-col gap-2">
          {buckets.map((bucket) => {
            const n = distribution[bucket];
            const pct = count === 0 ? 0 : (n / count) * 100;
            return (
              <li key={bucket} className="flex items-center gap-3 text-sm">
                <span className="text-sarat-black-600 w-3 text-end tabular-nums">{bucket}</span>
                <Star className="text-saffron-gold size-3.5 shrink-0 fill-current" aria-hidden />
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
      )}
    </div>
  );
}
