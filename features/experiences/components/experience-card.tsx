import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { formatSAR, durationHours } from '@/lib/format';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import type { ExperienceSummary } from '@/features/experiences/types';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';

/**
 * Presentational experience card. Restraint-first (BRIEF §3): hairline
 * border, no shadow. Featured ("Originals") uses the dark Sarat Black
 * surface with a Saffron Gold category accent.
 *
 * Intentionally NOT a link yet: the experience detail route doesn't
 * exist until Sprint 1 task 7. Becomes a Link then (no dead links).
 */

const CATEGORY_DOT: Record<Category, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
};

export interface ExperienceCardProps {
  experience: ExperienceSummary;
  locale: Locale;
}

export async function ExperienceCard({ experience, locale }: ExperienceCardProps) {
  const t = await getTranslations('experience');
  const title = locale === 'ar' ? experience.titleAr : experience.titleEn;
  const description = locale === 'ar' ? experience.descriptionAr : experience.descriptionEn;
  const category = CATEGORIES.find((c) => c.key === experience.category);
  const categoryLabel = category
    ? locale === 'ar'
      ? category.labelAr
      : category.labelEn
    : experience.category;

  const muted = experience.featured ? 'text-fog-white/70' : 'text-sarat-black-600';

  return (
    <Link
      href={`/experiences/${experience.slug}`}
      className="block transition-transform duration-200 hover:-translate-y-0.5"
    >
      <Card
        variant={experience.featured ? 'dark' : 'default'}
        className="flex h-full flex-col gap-4 p-6"
      >
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${experience.featured ? 'bg-saffron-gold' : CATEGORY_DOT[experience.category]}`}
            aria-hidden
          />
          <span className="text-[11px] tracking-[0.2em] uppercase">
            {experience.featured ? t('originals') : categoryLabel}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-display text-2xl font-medium tracking-[-0.025em] text-balance">
            {title}
          </h3>
          <p className={`text-base ${muted}`}>{description}</p>
        </div>

        <div className={`mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm ${muted}`}>
          <span>{experience.placeName}</span>
          <span aria-hidden>·</span>
          <span>
            {durationHours(experience.durationMinutes, locale)} {t('hours')}
          </span>
          <span aria-hidden>·</span>
          <span>{experience.hostName}</span>
        </div>

        <p className="text-base font-medium">
          {formatSAR(experience.priceSar, locale)}
          <span className={`text-sm font-normal ${muted}`}> {t('perPerson')}</span>
        </p>
      </Card>
    </Link>
  );
}
