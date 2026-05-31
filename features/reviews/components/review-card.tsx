import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { ReviewSummary } from '@/features/reviews/types';

interface ReviewCardProps {
  review: ReviewSummary;
  locale: Locale;
}

/**
 * Single review card. Server component — read-only.
 *
 * Rating renders five solid stars, the rated ones in saffron-gold and the
 * remainder muted. The host's reply (if any) is nested as a secondary
 * block beneath the review body, visually offset by a hairline border
 * on the inline-start side.
 */
export function ReviewCard({ review, locale }: ReviewCardProps) {
  const t = useTranslations('reviews');

  const body =
    locale === 'ar' ? (review.textAr ?? review.textEn) : (review.textEn ?? review.textAr);
  const dateLabel = formatDate(new Date(review.createdAt), locale, 'gregory', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <article className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium">{review.guestName}</p>
          <p className="text-sarat-black-600 text-sm">{dateLabel}</p>
        </div>
        <div
          className="flex items-center gap-1"
          aria-label={t('ratingLabel', { rating: review.rating })}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                'size-4 fill-current',
                i <= review.rating ? 'text-saffron-gold' : 'text-sarat-black/20',
              )}
              aria-hidden
            />
          ))}
        </div>
      </header>

      {body && <p className="text-sarat-black text-base leading-relaxed">{body}</p>}

      {review.hostReply && (
        <div className="border-sarat-black/8 mt-2 flex flex-col gap-1 [border-inline-start-width:0.5px] ps-4">
          <p
            className={cn(
              'text-sarat-black-600 text-[11px]',
              locale === 'en' && 'tracking-[0.2em] uppercase',
            )}
          >
            {t('hostReply')}
          </p>
          <p className="text-sarat-black-600 text-sm leading-relaxed">{review.hostReply}</p>
        </div>
      )}
    </article>
  );
}
