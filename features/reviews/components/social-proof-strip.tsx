import { Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getRecentReviews } from '@/features/reviews/queries';

/**
 * Home-page social proof — the three latest high-rated guest reviews,
 * each linking to its experience. Renders nothing while the platform
 * has no reviews yet (no empty-state scaffolding on a marketing strip).
 */

const STRIP_LIMIT = 3;

interface SocialProofStripProps {
  locale: Locale;
}

export async function SocialProofStrip({ locale }: SocialProofStripProps) {
  const reviews = await getRecentReviews(STRIP_LIMIT);
  if (reviews.length === 0) return null;

  const t = await getTranslations('home.socialProof');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section className="bg-mist">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
        <div className="flex flex-col gap-3">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-balance">
            {t('title')}
          </h2>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => {
            const text = locale === 'ar' ? (review.textAr ?? review.textEn) : review.textEn;
            const title = locale === 'ar' ? review.experienceTitleAr : review.experienceTitleEn;
            return (
              <li
                key={review.id}
                className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] bg-white p-6"
              >
                <div
                  className="flex items-center gap-1"
                  aria-label={t('ratingLabel', { rating: review.rating })}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'size-4 shrink-0',
                        i < review.rating
                          ? 'text-saffron-gold fill-current'
                          : 'text-sarat-black-200',
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
      </div>
    </section>
  );
}
