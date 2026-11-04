import type { Locale } from '@/lib/i18n';
import { todayInRiyadh } from '@/lib/riyadh-time';
import type { ReviewSummary } from '@/features/reviews/types';

/** One schema.org Review for the listing page's Product JSON-LD. */
export function reviewJsonLd(review: ReviewSummary, locale: Locale): Record<string, unknown> {
  // Same pick as ReviewCard, so the structured layer states exactly the
  // text the page shows: the Arabic page carried the English body while
  // rendering the Arabic one (2026-10-14 SEO run).
  const body =
    locale === 'ar' ? (review.textAr ?? review.textEn) : (review.textEn ?? review.textAr);
  return {
    '@type': 'Review',
    // guestName is ALREADY the public display form (first name + initial,
    // compound-name aware) — derived once at the query layer via
    // reviewDisplayName. Re-abbreviating here would re-split an
    // already-abbreviated name and mangle Arabic compound names.
    author: { '@type': 'Person', name: review.guestName },
    // The Riyadh calendar day, as on the visible card: slicing the UTC
    // ISO string dated reviews posted 00:00–03:00 KSA one day early.
    datePublished: todayInRiyadh(new Date(review.createdAt)),
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    ...(body ? { reviewBody: body } : {}),
  };
}
