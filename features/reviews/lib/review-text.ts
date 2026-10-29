import type { Locale } from '@/lib/i18n';

/**
 * The review body to show in `locale`. A review is written in one
 * language only (the other column stays null), so each locale falls
 * back to the other: without it an Arabic-only review rendered as bare
 * stars on every English surface.
 */
export function reviewText(
  review: { textEn: string | null; textAr: string | null },
  locale: Locale,
): string | null {
  return locale === 'ar' ? (review.textAr ?? review.textEn) : (review.textEn ?? review.textAr);
}
