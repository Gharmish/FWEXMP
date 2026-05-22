import { Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { formatSAR, durationHours, formatInteger } from '@/lib/format';
import { Link } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import type { ExperienceSummary } from '@/features/experiences/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';

/**
 * Presentational experience card. Restraint-first (BRIEF §3): hairline
 * border, no shadow. Featured ("Originals") uses the dark Sarat Black
 * surface with a Saffron Gold category accent. Wraps the whole card
 * in a Link to /experiences/[slug] with a 2px hover lift.
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
  const tr = await getTranslations('reviews');
  const title = locale === 'ar' ? experience.titleAr : experience.titleEn;
  const description = locale === 'ar' ? experience.descriptionAr : experience.descriptionEn;
  const placeName = locale === 'ar' ? toArabicText(experience.placeName) : experience.placeName;
  const hostName = locale === 'ar' ? toArabicText(experience.hostName) : experience.hostName;
  const category = CATEGORIES.find((c) => c.key === experience.category);
  const categoryLabel = category
    ? locale === 'ar'
      ? category.labelAr
      : category.labelEn
    : experience.category;

  const muted = experience.featured ? 'text-fog-white/70' : 'text-sarat-black-600';
  const labelClassName = cn('text-[11px]', locale === 'en' && 'tracking-[0.2em] uppercase');

  const ratingDisplay =
    experience.ratingAverage !== null
      ? new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(experience.ratingAverage)
      : null;
  const ratingCountDisplay = formatInteger(experience.ratingCount, locale);

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
          <span className={labelClassName}>
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
          <span>{placeName}</span>
          <span aria-hidden>·</span>
          <span>
            {durationHours(experience.durationMinutes, locale)} {t('hours')}
          </span>
          <span aria-hidden>·</span>
          <span>{hostName}</span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <p className="text-base font-medium">
            {formatSAR(experience.priceSar, locale)}
            <span className={`text-sm font-normal ${muted}`}> {t('perPerson')}</span>
          </p>

          {ratingDisplay && (
            <p
              className={cn('flex items-center gap-1.5 text-sm', muted)}
              aria-label={tr('ratingLabel', { rating: experience.ratingAverage ?? 0 })}
            >
              <Star className="text-saffron-gold size-3.5 shrink-0" aria-hidden />
              <span
                className={cn(
                  'font-medium',
                  experience.featured ? 'text-fog-white' : 'text-sarat-black',
                )}
              >
                {ratingDisplay}
              </span>
              <span>({ratingCountDisplay})</span>
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
