import {
  CalendarClock,
  Castle,
  Coffee,
  Flower2,
  Leaf,
  Mountain,
  Sparkles,
  Star,
  Users,
  Venus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
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
import { VerifiedSeal } from '@/components/ui/verified-seal';

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
// P2-4: the pale categories (food/wellness/family/women_only) were
// indistinguishable from white at their old low opacity — raised to the
// -100/-200 ramp steps so the tile reads as a deliberate tonal block.
const CATEGORY_PLACEHOLDER: Record<Category, string> = {
  nature: 'bg-juniper-green/15',
  heritage: 'bg-al-qatt-red/15',
  food: 'bg-saffron-gold-200',
  wellness: 'bg-wadi-mint-200',
  adventure: 'bg-soudah-sunset/15',
  family: 'bg-sarawat-blue-100',
  women_only: 'bg-tihama-coral-200',
};

/**
 * Dark-surface variant of the placeholder for featured (Originals) cards
 * — the light tints above read as a black void on the Sarat Black card.
 * A white/8 base carries background-color while the stronger category
 * stop rides background-image, so the two layers don't collide.
 */
const CATEGORY_PLACEHOLDER_DARK: Record<Category, string> = {
  nature: 'bg-white/8 bg-gradient-to-b from-juniper-green/40 to-transparent',
  heritage: 'bg-white/8 bg-gradient-to-b from-al-qatt-red/40 to-transparent',
  food: 'bg-white/8 bg-gradient-to-b from-saffron-gold/40 to-transparent',
  wellness: 'bg-white/8 bg-gradient-to-b from-wadi-mint/40 to-transparent',
  adventure: 'bg-white/8 bg-gradient-to-b from-soudah-sunset/40 to-transparent',
  family: 'bg-white/8 bg-gradient-to-b from-sarawat-blue/40 to-transparent',
  women_only: 'bg-white/8 bg-gradient-to-b from-tihama-coral/40 to-transparent',
};

/**
 * Category icons for the photo-less placeholder — mirrors the catalogue
 * strip's taxonomy (Castle for Aseer's fortress villages, not a foreign
 * temple). Kept local per that file's convention.
 */
const CATEGORY_ICON: Record<Category, LucideIcon> = {
  nature: Leaf,
  heritage: Castle,
  food: Coffee,
  wellness: Flower2,
  adventure: Mountain,
  family: Users,
  women_only: Venus,
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
  /**
   * Eager-load the card's first photo. Set on cards rendered above the
   * fold (e.g. the catalog grid's first row) so the LCP image isn't
   * lazy-loaded. Featured cards are always eager.
   */
  priority?: boolean;
}

export async function ExperienceCard({
  experience,
  locale,
  actions,
  priority = false,
}: ExperienceCardProps) {
  const t = await getTranslations('experience');
  const tr = await getTranslations('reviews');
  const tv = await getTranslations('verifiedBadge');
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
  const labelClassName = cn(
    'font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

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
  const PlaceholderIcon = CATEGORY_ICON[experience.category];

  // Duration copy: whole and half hours get proper ICU plural grammar
  // (Arabic needs ساعة/ساعتان/ساعات by count — "3 ساعة" is broken); any
  // other fraction (odd host-entered minutes) falls back to the numeric
  // form, where a decimal correctly takes the Arabic singular.
  const wholeHours = Math.floor(experience.durationMinutes / 60);
  const minuteRemainder = experience.durationMinutes % 60;
  const durationLabel =
    minuteRemainder === 0
      ? t('durationHours', { count: wholeHours })
      : minuteRemainder === 30
        ? t('durationHoursHalf', { count: wholeHours })
        : `${durationHours(experience.durationMinutes, locale)} ${t('hours')}`;

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
              linkLabel={title}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              aspectClassName="aspect-[16/9]"
              priority={priority || experience.featured}
              copy={carouselCopy}
              // A grid of independently auto-cycling cards violates WCAG
              // 2.2.2 (no pause mechanism) — cards stay still; swiping is
              // manual.
              autoAdvanceMs={0}
            />
          ) : (
            // Same tap target as the carousel branch. aria-hidden +
            // tabIndex -1: the text Link below carries the accessible
            // name, so this adds no duplicate tab stop for AT.
            <Link
              href={href}
              aria-hidden
              tabIndex={-1}
              className={cn(
                'flex aspect-[16/9] w-full items-center justify-center',
                experience.featured
                  ? CATEGORY_PLACEHOLDER_DARK[experience.category]
                  : CATEGORY_PLACEHOLDER[experience.category],
              )}
            >
              <PlaceholderIcon
                className={cn(
                  // P2-4: larger centred glyph so the tonal tile reads as
                  // deliberate rather than an empty/broken block.
                  'size-12',
                  experience.featured ? 'text-white/40' : 'text-sarat-black/25',
                )}
                strokeWidth={1.5}
                aria-hidden
              />
            </Link>
          )}

          <Link href={href} className="flex flex-1 flex-col gap-4 p-6">
            {/* flex-wrap + gap-y-1: three chips exceed a 375px column —
                without wrapping the Card's overflow-hidden clips them. */}
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
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
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                    experience.featured
                      ? 'bg-white/15 text-white'
                      : 'bg-saffron-gold/20 text-sarat-black',
                  )}
                >
                  <Zap className="size-4 shrink-0" aria-hidden />
                  {t('instant')}
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                    experience.featured
                      ? 'bg-white/15 text-white/90'
                      : 'bg-sarat-black/8 text-sarat-black-800',
                  )}
                >
                  <CalendarClock className="size-4 shrink-0" aria-hidden />
                  {t('requestMode')}
                </span>
              )}
              {experience.isNew && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                    experience.featured ? 'bg-white/15 text-white' : 'bg-info-surface text-info',
                  )}
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t('newBadge')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-display text-2xl font-medium tracking-[-0.025em] text-balance">
                {title}
              </h3>
              {/* Phones get the single-column grid — clamp so one wordy
                  listing can't push the next card two screens away. The
                  full text lives on the detail page. */}
              {/* rtl:text-lg — Arabic body reads one step up (BRIEF §3). */}
              <p className={`text-base max-sm:line-clamp-3 rtl:text-lg ${muted}`}>{description}</p>
            </div>

            {/* P3-3: host on its own line — when "place · duration" and
                "With {host}" shared one wrapped row, a mid-line break left
                a dangling "·" at the end of the first line. */}
            <div className={`mt-auto flex flex-col gap-1 text-sm ${muted}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>{placeName}</span>
                <span aria-hidden>·</span>
                <span>{durationLabel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {t('withHost', { name: hostName })}
                {/* Micro-seal, not the tappable lockup: the whole card is one
                    Link, so a nested button would be invalid — the card builds
                    the reflex, the detail page opens the door. */}
                {experience.hostVerified && (
                  <VerifiedSeal className="size-3.5" label={tv('lockup')} />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <p className="text-base font-medium">
                <Price amount={experience.priceSar} locale={locale} />
                <span className={`text-sm font-normal ${muted}`}> {t('perPerson')}</span>
              </p>

              {ratingDisplay && (
                <p
                  role="img"
                  className={cn('flex items-center gap-2 text-sm', muted)}
                  // L11: sighted users see the review count next to the
                  // stars; the aria-label omitted it.
                  aria-label={tr('ratingLabelWithCount', {
                    rating: experience.ratingAverage ?? 0,
                    count: experience.ratingCount,
                  })}
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
