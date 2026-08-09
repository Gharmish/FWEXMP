import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getReviewsForExperience } from '@/features/reviews/queries';
import type { ReviewAggregate } from '@/features/reviews/types';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { RatingSummary } from '@/features/reviews/components/rating-summary';
import { ReviewCard } from '@/features/reviews/components/review-card';

interface ReviewsSectionProps {
  experienceSlug: string;
  locale: Locale;
  /**
   * The already-fetched aggregate for this experience, passed down rather
   * than re-read here. The detail page fetches it for its JSON-LD anyway,
   * so fetching it again in this section ran the same lookup + groupBy a
   * second time on every render — and because this section resolves after
   * the page's own waves, that duplicate was the read most likely to be
   * still in flight when the response completed, leaving a connection
   * abandoned mid-statement (2026-08-08; see the wave comment in the
   * detail page for why an abandoned read is so costly here).
   */
  aggregate: ReviewAggregate;
  /** Render the full list (`?reviews=all`) instead of the first page. */
  showAll?: boolean;
  /** Href that re-renders the page with every review visible. */
  showAllHref?: string;
}

/** Initial reviews shown before the "show all" link. */
const INITIAL_VISIBLE = 4;

/** Hard ceiling for the expanded view — keeps the page bounded. */
const ALL_VISIBLE_CAP = 100;

/**
 * Reviews section for the experience detail page. Server component —
 * fetches reviews + aggregate in parallel.
 *
 * Pagination strategy: the default render fetches only the first
 * INITIAL_VISIBLE reviews and reads the total from the aggregate;
 * `?reviews=all` re-renders with the full (capped) list — a plain
 * server-rendered link, no client JS.
 */
export async function ReviewsSection({
  experienceSlug,
  locale,
  aggregate,
  showAll = false,
  showAllHref,
}: ReviewsSectionProps) {
  const t = await getTranslations('reviews');
  const visible = await getReviewsForExperience(
    experienceSlug,
    showAll ? ALL_VISIBLE_CAP : INITIAL_VISIBLE,
  );

  const hidden = Math.max(0, aggregate.count - visible.length);
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
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
        <Stagger>
          <ul className="grid gap-4 sm:grid-cols-2">
            {visible.map((review) => (
              <li key={review.id}>
                <StaggerItem className="h-full">
                  <ReviewCard review={review} locale={locale} />
                </StaggerItem>
              </li>
            ))}
          </ul>
        </Stagger>
      )}

      {hidden > 0 &&
        (showAllHref && !showAll ? (
          <Link
            href={showAllHref}
            className="text-sarat-black self-start text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('showAll', { count: hidden })}
          </Link>
        ) : (
          <p className="text-sarat-black-600 text-sm">{t('moreHidden', { count: hidden })}</p>
        ))}
    </section>
  );
}
