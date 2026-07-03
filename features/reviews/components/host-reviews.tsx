import { Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getReviewsByHostSlug } from '@/features/reviews/queries';

/**
 * "What guests are saying" on the public host profile — the host's most
 * recent high-rated guest reviews, each linking to its experience. Renders
 * nothing until the host has any (no empty-state scaffolding on a marketing
 * surface). Mirrors the home-page social-proof strip's card treatment.
 */

const HOST_REVIEWS_LIMIT = 6;

interface HostReviewsProps {
  slug: string;
  locale: Locale;
}

export async function HostReviews({ slug, locale }: HostReviewsProps) {
  const reviews = await getReviewsByHostSlug(slug, HOST_REVIEWS_LIMIT);
  if (reviews.length === 0) return null;

  const t = await getTranslations('hostProfile.reviews');
  const tr = await getTranslations('reviews');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section className="border-sarat-black/8 mt-12 flex flex-col gap-8 [border-top-width:0.5px] pt-12">
      <div className="flex flex-col gap-3">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('title')}</h2>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => {
          const text = locale === 'ar' ? (review.textAr ?? review.textEn) : review.textEn;
          const title = locale === 'ar' ? review.experienceTitleAr : review.experienceTitleEn;
          return (
            <li
              key={review.id}
              className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6"
            >
              <div
                className="flex items-center gap-1"
                aria-label={tr('ratingLabel', { rating: review.rating })}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'size-4 shrink-0',
                      i < review.rating ? 'text-saffron-gold fill-current' : 'text-sarat-black-200',
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              {text && <p className="text-sarat-black-800 text-base leading-relaxed">“{text}”</p>}
              <p className="text-sarat-black-600 mt-auto text-sm">
                {review.guestName}
                {' · '}
                <Link
                  href={`/experiences/${review.experienceSlug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {title}
                </Link>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
