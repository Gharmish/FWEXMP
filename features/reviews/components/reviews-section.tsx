import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  getReviewAggregateForExperience,
  getReviewsForExperience,
} from '@/features/reviews/queries';
import { RatingSummary } from '@/features/reviews/components/rating-summary';
import { ReviewCard } from '@/features/reviews/components/review-card';

interface ReviewsSectionProps {
  experienceSlug: string;
  locale: Locale;
}

/** Initial reviews shown before any "show more" pagination control. */
const INITIAL_VISIBLE = 4;

/**
 * Reviews section for the experience detail page. Server component —
 * fetches reviews + aggregate in parallel.
 *
 * Pagination strategy: we fetch only the first INITIAL_VISIBLE reviews
 * for display and read the total count from the aggregate (a bounded
 * GROUP BY), so neither query scales with an experience's review count.
 * A future PR swaps the "N more not shown" line for a "show more" button
 * or a dedicated /reviews route once the dataset grows.
 */
export async function ReviewsSection({ experienceSlug, locale }: ReviewsSectionProps) {
  const t = await getTranslations('reviews');
  const [visible, aggregate] = await Promise.all([
    getReviewsForExperience(experienceSlug, INITIAL_VISIBLE),
    getReviewAggregateForExperience(experienceSlug),
  ]);

  const hidden = Math.max(0, aggregate.count - visible.length);
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section
      id="reviews"
      className="border-sarat-black/8 flex flex-col gap-8 [border-top-width:0.5px] pt-10"
    >
      <header className="flex flex-col gap-2">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('heading')}</h2>
      </header>

      <RatingSummary aggregate={aggregate} locale={locale} />

      {visible.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} locale={locale} />
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <p className="text-sarat-black-600 text-sm">{t('moreHidden', { count: hidden })}</p>
      )}
    </section>
  );
}
