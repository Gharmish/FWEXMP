import {
  CalendarClock,
  CalendarDays,
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
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { durationHours, formatInteger, formatRating } from '@/lib/format';
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
 *
 * Photo-led (2026-11): the photo is 4:3 and carries the booking-state
 * chip; the text is title (two lines), a two-line description from `sm`
 * up, place · duration, the host with their portrait, and the price.
 * Every card fills its grid row, so a row's prices line up.
 */

/** Booking-state chip laid over the photo's top-start corner. */
const PHOTO_CHIP =
  'border-sarat-black/12 text-sarat-black pointer-events-none absolute start-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border bg-white/90 px-2 py-1 text-xs font-medium rtl:text-sm';

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
  /**
   * Set where the card sits in a two-column grid (the featured rows): from
   * `sm` up the photo stays 16:9, because 4:3 at that width is taller than
   * the card's text can balance.
   */
  wide?: boolean;
}

export async function ExperienceCard({
  experience,
  locale,
  actions,
  priority = false,
  wide = false,
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
  const labelClassName = cn('text-eyebrow');

  const ratingDisplay =
    experience.ratingAverage !== null ? formatRating(experience.ratingAverage, locale) : null;
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

  // No recurring weekday means no date can open — the one "no dates" case
  // the summary can prove without the per-listing schedule read. The chip
  // then says so instead of advertising a booking mode nobody can use
  // (2026-11 UX audit P1-1). Blackouts / sold-out horizons still show the
  // mode chip; the detail page is where those are resolved.
  const datesSoon = experience.availabilityWeekdays.length === 0;
  const aspectClassName = wide ? 'aspect-[4/3] sm:aspect-[16/9]' : 'aspect-[4/3]';

  return (
    <div className="relative h-full">
      <HoverLift className="h-full">
        <Card
          variant={experience.featured ? 'dark' : 'default'}
          className="relative flex h-full flex-col p-0"
        >
          {/* Hero carousel. Swipe/drag through the gallery; a tap navigates
              to the listing. Falls back to a tonal block in the category
              colour when no photo is uploaded yet, so cards stay consistent
              pre-shoot. Hosts frame uploads at 16:9, so 4:3 trims the sides. */}
          {photos.length > 0 ? (
            <PhotoCarousel
              images={photos}
              alt={title}
              locale={locale}
              href={href}
              linkLabel={title}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              aspectClassName={aspectClassName}
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
                'flex w-full items-center justify-center',
                aspectClassName,
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

          {/* Booking state on the photo: one chip, 12px (the old in-row
              chips were 11px — below the brief's floor — and wrapped). It
              is decoration over the tap layer, so pointer-events pass
              through to the link beneath. */}
          <span className={PHOTO_CHIP}>
            {datesSoon ? (
              <>
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                {t('datesSoon')}
              </>
            ) : experience.bookingMode === 'instant' ? (
              <>
                <Zap className="size-4 shrink-0" aria-hidden />
                {t('instant')}
              </>
            ) : (
              <>
                <CalendarClock className="size-4 shrink-0" aria-hidden />
                {t('requestMode')}
              </>
            )}
          </span>

          <Link href={href} className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
            {/* Category at the start, proof at the end: the rating when
                there is one, otherwise the "New" flag for fresh listings. */}
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    experience.featured ? 'bg-saffron-gold' : CATEGORY_DOT[experience.category],
                  )}
                  aria-hidden
                />
                <span className={cn(labelClassName, 'truncate')}>
                  {experience.featured ? t('originals') : categoryLabel}
                </span>
              </span>
              {ratingDisplay ? (
                <span
                  role="img"
                  className={cn('flex shrink-0 items-center gap-1 text-sm', muted)}
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
                </span>
              ) : experience.isNew ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium rtl:text-sm',
                    experience.featured ? 'bg-white/15 text-white' : 'bg-info-surface text-info',
                  )}
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t('newBadge')}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-h3 line-clamp-2 text-balance">{title}</h3>
              {/* Two lines from `sm` up, none on phones: the single-column
                  phone card is photo, title, host, price — the full text
                  lives on the detail page. */}
              {/* rtl:text-lg — Arabic body reads one step up (BRIEF §3). */}
              <p className={cn('hidden text-base sm:line-clamp-2 rtl:text-lg', muted)}>
                {description}
              </p>
            </div>

            {/* P3-3: host on its own line — when "place · duration" and
                "With {host}" shared one wrapped row, a mid-line break left
                a dangling "·" at the end of the first line. `mt-auto` pins
                this block and the price to the card's bottom edge, which is
                what lines them up across a row. */}
            <div className={cn('mt-auto flex flex-col gap-2 text-sm', muted)}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>{placeName}</span>
                <span aria-hidden>·</span>
                <span>{durationLabel}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {/* The host's face (initials until a portrait lands) — hosts
                    are the product. Decorative: the name follows in text. */}
                <Avatar
                  name={hostName}
                  src={experience.hostAvatar ?? undefined}
                  size="sm"
                  className="size-6"
                  aria-hidden
                />
                <span className="truncate">{t('withHost', { name: hostName })}</span>
                {/* Micro-seal, not the tappable lockup: the whole card is one
                    Link, so a nested button would be invalid — the card builds
                    the reflex, the detail page opens the door. */}
                {experience.hostVerified && (
                  <VerifiedSeal className="size-3.5" label={tv('lockup')} />
                )}
              </div>
            </div>

            <p className="text-base font-medium">
              <Price amount={experience.priceSar} locale={locale} />
              <span className={cn('text-sm font-normal', muted)}> {t('perPerson')}</span>
            </p>
          </Link>
        </Card>
      </HoverLift>
      {actions && <div className="absolute end-4 top-4 z-20">{actions}</div>}
    </div>
  );
}
