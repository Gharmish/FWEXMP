import { CalendarClock, Sparkles, Star, Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { durationHours, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { Link } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import type { ExperienceSummary } from '@/features/experiences/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { HoverLift } from '@/components/ui/motion';
import { PhotoCarousel } from '@/components/ui/photo-carousel';

/**
 * Presentational experience card. Restraint-first (BRIEF §3): hairline
 * border, no shadow. Featured ("Originals") uses the dark Sarat Black
 * surface with a Saffron Gold category accent. Wraps the whole card
 * in a Link to /experiences/[slug] with a 2px spring hover lift
 * (BRIEF §3 motion — disabled under prefers-reduced-motion).
 */

const CATEGORY_DOT: Record<Category, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
  women_only: 'bg-tihama-coral',
};

/**
 * Tonal placeholder background per category, used when an experience
 * has no `heroImage` yet (host approved but photography session not
 * shot). Stays on-brand instead of leaving an awkward grey block.
 */
const CATEGORY_PLACEHOLDER: Record<Category, string> = {
  nature: 'bg-juniper-green/15',
  heritage: 'bg-al-qatt-red/15',
  food: 'bg-saffron-gold/20',
  wellness: 'bg-wadi-mint/25',
  adventure: 'bg-soudah-sunset/15',
  family: 'bg-sarawat-blue/15',
  women_only: 'bg-tihama-coral/25',
};

export interface ExperienceCardProps {
  experience: ExperienceSummary;
  locale: Locale;
  /**
   * Optional content rendered absolutely positioned in the card's
   * top-end corner — wishlist heart today, room for share / quick-book
   * later. Lives outside the Link wrapper so its own click events
   * don't trigger card navigation.
   */
  actions?: React.ReactNode;
}

export async function ExperienceCard({ experience, locale, actions }: ExperienceCardProps) {
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

  const muted = experience.featured ? 'text-white/70' : 'text-sarat-black-600';
  const labelClassName = cn('text-[11px]', locale === 'en' && 'tracking-[0.2em] uppercase');

  const ratingDisplay =
    experience.ratingAverage !== null
      ? new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
          numberingSystem: 'latn',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(experience.ratingAverage)
      : null;
  const ratingCountDisplay = formatInteger(experience.ratingCount, locale);

  // Hero-first photo set for the card carousel. `{n}` is a literal the
  // PhotoCarousel interpolates per slide, so the ICU template survives the
  // server→client boundary.
  const photos = experience.heroImage ? [experience.heroImage, ...(experience.images ?? [])] : [];
  const carouselCopy = {
    prev: t('photoPrev'),
    next: t('photoNext'),
    goTo: t('photoGoTo', { n: '{n}' }),
  };
  const href = `/experiences/${experience.slug}`;

  return (
    <div className="relative">
      <HoverLift>
        <Card
          variant={experience.featured ? 'dark' : 'default'}
          className="flex h-full flex-col overflow-hidden p-0"
        >
          {/* Hero carousel — 16:9 to match the canonical crop hosts frame at
              upload. Swipe/drag through the gallery; a tap navigates to the
              listing. Falls back to a tonal block in the category colour when
              no photo is uploaded yet, so cards stay consistent pre-shoot. */}
          {photos.length > 0 ? (
            <PhotoCarousel
              images={photos}
              alt={title}
              locale={locale}
              href={href}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              aspectClassName="aspect-[16/9]"
              priority={experience.featured}
              copy={carouselCopy}
            />
          ) : (
            <div
              className={cn('aspect-[16/9] w-full', CATEGORY_PLACEHOLDER[experience.category])}
            />
          )}

          <Link href={href} className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${experience.featured ? 'bg-saffron-gold' : CATEGORY_DOT[experience.category]}`}
                aria-hidden
              />
              <span className={labelClassName}>
                {experience.featured ? t('originals') : categoryLabel}
              </span>
              {experience.bookingMode === 'instant' ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
                    experience.featured
                      ? 'bg-white/15 text-white'
                      : 'bg-saffron-gold/20 text-sarat-black',
                  )}
                >
                  <Zap className="size-3 shrink-0" aria-hidden />
                  {t('instant')}
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
                    experience.featured
                      ? 'bg-white/15 text-white/90'
                      : 'bg-sarat-black/8 text-sarat-black-800',
                  )}
                >
                  <CalendarClock className="size-3 shrink-0" aria-hidden />
                  {t('requestMode')}
                </span>
              )}
              {experience.isNew && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
                    experience.featured ? 'bg-white/15 text-white' : 'bg-info-surface text-info',
                  )}
                >
                  <Sparkles className="size-3 shrink-0" aria-hidden />
                  {t('newBadge')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-display text-2xl font-medium tracking-[-0.025em] text-balance">
                {title}
              </h3>
              <p className={`text-base ${muted}`}>{description}</p>
            </div>

            <div
              className={`mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm ${muted}`}
            >
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
                <Price amount={experience.priceSar} locale={locale} />
                <span className={`text-sm font-normal ${muted}`}> {t('perPerson')}</span>
              </p>

              {ratingDisplay && (
                <p
                  className={cn('flex items-center gap-2 text-sm', muted)}
                  aria-label={tr('ratingLabel', { rating: experience.ratingAverage ?? 0 })}
                >
                  <Star className="text-saffron-gold size-3.5 shrink-0 fill-current" aria-hidden />
                  <span
                    className={cn(
                      'font-medium',
                      experience.featured ? 'text-white' : 'text-sarat-black',
                    )}
                  >
                    {ratingDisplay}
                  </span>
                  <span>({ratingCountDisplay})</span>
                </p>
              )}
            </div>
          </Link>
        </Card>
      </HoverLift>
      {actions && <div className="absolute end-4 top-4 z-20">{actions}</div>}
    </div>
  );
}
