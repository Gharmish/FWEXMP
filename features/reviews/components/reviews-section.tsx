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
 * Pagination strategy: at launch each experience has 2-3 reviews, so
 * the full list fits without paging. We still cap at INITIAL_VISIBLE
 * and surface a count of hidden reviews as a forward-looking affordance
 * — a future PR will swap this for a "show more" button or a dedicated
 * /reviews route per host once the dataset grows.
 */
export async function ReviewsSection({ experienceSlug, locale }: ReviewsSectionProps) {
  const t = await getTranslations('reviews');
  const [reviews, aggregate] = await Promise.all([
    getReviewsForExperience(experienceSlug),
    getReviewAggregateForExperience(experienceSlug),
  ]);

  const visible = reviews.slice(0, INITIAL_VISIBLE);
  const hidden = reviews.length - visible.length;
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

      {reviews.length > 0 && (
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
