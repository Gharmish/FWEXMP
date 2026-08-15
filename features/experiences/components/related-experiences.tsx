import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/features/experiences/types';
import { getExperiences } from '@/features/experiences/queries';
import { getWishlistSet } from '@/features/wishlist/queries';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';

interface RelatedExperiencesProps {
  /** The experience being viewed — never recommended back to the guest. */
  excludeSlug: string;
  /**
   * Ranking context. Callers that already hold the experience (detail page)
   * pass both; callers that only hold a slug (booking confirmation) omit
   * them and the component derives both from the live catalog.
   */
  city?: string;
  category?: Category;
  locale: Locale;
}

/**
 * Cross-sell strip: up to three other live experiences, same city first,
 * then same category. Mounted where a guest journey would otherwise dead-end
 * (below the detail page's reviews — which also serves the sold-out state —
 * and on the booking confirmation). Renders nothing when the catalog has no
 * alternatives; `getExperiences` already degrades to `[]` on a DB error, so
 * this can never take a public page down with it.
 */
export async function RelatedExperiences({
  excludeSlug,
  city,
  category,
  locale,
}: RelatedExperiencesProps) {
  const [all, saved] = await Promise.all([getExperiences(), getWishlistSet()]);
  const pool = all.filter((e) => e.slug !== excludeSlug);
  const current = all.find((e) => e.slug === excludeSlug);
  const rankCity = city ?? current?.city;
  const rankCategory = category ?? current?.category;
  const related = [
    ...pool.filter((e) => e.city === rankCity),
    ...pool.filter((e) => e.city !== rankCity && e.category === rankCategory),
    ...pool.filter((e) => e.city !== rankCity && e.category !== rankCategory),
  ].slice(0, 3);
  if (related.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'relatedExperiences' });
  return (
    <section aria-label={t('title')} className="mt-16 flex flex-col gap-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('title')}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((experience) => (
          <ExperienceCard
            key={experience.slug}
            experience={experience}
            locale={locale}
            actions={
              <WishlistButton
                slug={experience.slug}
                isSaved={saved.has(experience.slug)}
                surface={experience.featured ? 'dark' : 'light'}
              />
            }
          />
        ))}
      </div>
    </section>
  );
}
