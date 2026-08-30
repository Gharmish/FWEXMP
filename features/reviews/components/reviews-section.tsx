import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getReviewsForExperience } from '@/features/reviews/queries';
import type { ReviewAggregate, ReviewSummary } from '@/features/reviews/types';
import { JsonLd } from '@/components/seo/json-ld';
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
  /**
   * `@id` of the page's Product JSON-LD node. When set, the first-page
   * reviews are emitted as `review` entries on a node with that same
   * `@id` — JSON-LD merges nodes by `@id` across script blocks, so the
   * entries attach to the Product without this (Suspense-streamed)
   * section blocking the page body's own JSON-LD. Omit on previews.
   */
  productId?: string;
}

function reviewJsonLd(review: ReviewSummary): Record<string, unknown> {
  // Body pick mirrors ReviewCard: EN text first for the structured layer
  // (it is locale-independent), falling back to the Arabic text.
  const body = review.textEn ?? review.textAr;
  return {
    '@type': 'Review',
    // guestName is ALREADY the public display form (first name + initial,
    // compound-name aware) — derived once at the query layer via
    // reviewDisplayName. Re-abbreviating here would re-split an
    // already-abbreviated name and mangle Arabic compound names.
    author: { '@type': 'Person', name: review.guestName },
    datePublished: review.createdAt.slice(0, 10),
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    ...(body ? { reviewBody: body } : {}),
  };
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
  productId,
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
      // scroll-mt clears the sticky navbar so the `#reviews` anchor never
      // lands with its heading hidden underneath it.
      className="border-sarat-black/8 flex scroll-mt-20 flex-col gap-8 [border-top-width:0.5px] pt-10"
    >
      {productId && visible.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Product',
            '@id': productId,
            // First page only, even under `?reviews=all` — the aggregate
            // already carries the full count.
            review: visible.slice(0, INITIAL_VISIBLE).map(reviewJsonLd),
          }}
        />
      )}
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
