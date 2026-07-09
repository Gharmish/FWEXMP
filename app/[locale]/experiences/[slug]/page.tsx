import type { Metadata } from 'next';
import {
  ArrowLeft,
  Backpack,
  Cake,
  CalendarClock,
  Check,
  Clock,
  MapPin,
  ShieldCheck,
  Sunrise,
  Users,
  Zap,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { durationHours, formatInteger, formatDate, formatTime } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { JsonLd } from '@/components/seo/json-ld';
import { BookingRequestForm } from '@/features/bookings/components/booking-request-form';
import { getKnownGuestDetails } from '@/features/account/guest-prefill';
import { HostCard } from '@/features/hosts/components/host-card';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import {
  getAllSlugs,
  getExperienceBySlug,
  getExperienceBySlugForOwnerPreview,
} from '@/features/experiences/queries';
import { PhotoGallery } from '@/features/experiences/components/photo-gallery';
import { MeetingPointMap } from '@/features/experiences/components/meeting-point-map';
import { trackExperienceView, utmFromSearchParams } from '@/features/analytics/capture';
import { getScheduleDataBySlug } from '@/features/availability/queries';
import { addDays, bookableDates } from '@/features/bookings/lib/availability';
import { vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getCompletedBookingsCountForExperience } from '@/features/bookings/queries';
import { getHostResponseStats } from '@/features/hosts/queries';
import { Badge } from '@/components/ui/badge';
import { ReviewsSection } from '@/features/reviews/components/reviews-section';
import { getReviewAggregateForExperience } from '@/features/reviews/queries';
import { Draw, FadeIn, MountFade, Stagger, StaggerItem } from '@/components/ui/motion';

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const exp = await getExperienceBySlug(slug);
  if (!exp) return {};
  const title = locale === 'ar' ? exp.titleAr : exp.titleEn;
  const description = locale === 'ar' ? exp.descriptionAr : exp.descriptionEn;
  const url = `${SITE_URL}/${locale}/experiences/${slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${SITE_URL}/${l}/experiences/${slug}`]),
      ),
    },
    openGraph: {
      // og:image is supplied by the co-located opengraph-image.tsx (dynamic,
      // per-experience). Omitting it here lets the file convention win.
      title,
      description,
      url,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ExperienceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const sp = await searchParams;
  const showAllReviews = (Array.isArray(sp.reviews) ? sp.reviews[0] : sp.reviews) === 'all';

  // "Change date or guests" from the payment step carries the held
  // booking's choices back so the guest edits, not restarts. Validated
  // here (shape) and again in the form (must still be bookable).
  const spDate = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const initialDate = spDate && /^\d{4}-\d{2}-\d{2}$/.test(spDate) ? spDate : undefined;
  const spParty = Number(Array.isArray(sp.party) ? sp.party[0] : sp.party);
  const initialPartySize =
    Number.isInteger(spParty) && spParty >= 1 ? Math.min(spParty, 50) : undefined;

  // Owner pre-publish preview: `?preview=1` reads the row regardless of
  // status, but only for the listing's own host (or an admin) — anyone
  // else falls through to the same 404 a missing slug produces.
  const previewMode = (Array.isArray(sp.preview) ? sp.preview[0] : sp.preview) === '1';
  const exp = previewMode
    ? await getExperienceBySlugForOwnerPreview(slug)
    : await getExperienceBySlug(slug);
  if (!exp) notFound();

  // Funnel signal (view side of view->request conversion). Not fired for
  // owner previews - those are hosts checking their own draft, not demand.
  if (!previewMode) {
    trackExperienceView({ experienceSlug: exp.slug, locale: loc, utm: utmFromSearchParams(sp) });
  }

  // Everything below depends only on the slug/host/locale — one parallel
  // fan-out instead of the previous chain of sequential awaits, which
  // stacked ~4 extra DB round-trips of latency onto every view (2026-07
  // audit M10). The aggregate feeds JSON-LD + the reviews section; the
  // schedule builds the guest date picker (open weekday, not
  // blackout/stop-sell/past, with capacity) over the next ~8 weeks.
  const BOOKING_HORIZON_DAYS = 60;
  const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
    new Date(),
  );
  const [
    ratingAggregate,
    t,
    te,
    tb,
    schedule,
    settings,
    completedCount,
    hostResponseStats,
    knownGuest,
  ] = await Promise.all([
    getReviewAggregateForExperience(slug),
    getTranslations('experienceDetail'),
    getTranslations('experience'),
    getTranslations('bookingRequest'),
    getScheduleDataBySlug(slug, todayRiyadh, addDays(todayRiyadh, BOOKING_HORIZON_DAYS)),
    getPlatformSettings(),
    getCompletedBookingsCountForExperience(exp.slug),
    getHostResponseStats(exp.hostSlug),
    // Prefill for a returning/signed-in guest so they don't retype contact
    // details. Empty for a first-time visitor. Not needed in preview mode
    // (booking form is disabled), but cheap enough to always resolve.
    getKnownGuestDetails(),
  ]);
  const availableDates = (
    schedule
      ? bookableDates({
          fromStr: todayRiyadh,
          days: BOOKING_HORIZON_DAYS + 1,
          availabilityWeekdays: schedule.availabilityWeekdays,
          blackoutDates: schedule.blackoutDates,
          stopSellDates: schedule.stopSellDates,
          maxGroupSize: schedule.maxGroupSize,
          bookedByDate: schedule.bookedByDate,
        })
      : []
  ).map((d) => ({
    value: d.date,
    label: formatDate(new Date(`${d.date}T12:00:00Z`), loc, 'gregory', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }),
    remaining: d.remaining,
    // ICU-format the count server-side; passing the raw template to the
    // client and formatting there breaks next-intl's placeholder handling.
    spotsLabel: tb('spotsLeft', { count: d.remaining }),
  }));

  const title = loc === 'ar' ? exp.titleAr : exp.titleEn;
  const description = loc === 'ar' ? exp.descriptionAr : exp.descriptionEn;
  const placeName = loc === 'ar' ? toArabicText(exp.placeName) : exp.placeName;
  const city = loc === 'ar' ? toArabicText(exp.city) : exp.city;
  const region = loc === 'ar' ? toArabicText(exp.region) : exp.region;
  const location = loc === 'ar' ? `${city}، ${region}` : `${city}, ${region}`;
  // Admin-authored Arabic lists win; the seed dictionary is the fallback
  // for listings whose Arabic hasn't been written yet.
  const inclusions =
    loc === 'ar'
      ? exp.inclusionsAr.length > 0
        ? exp.inclusionsAr
        : exp.inclusions.map(toArabicText)
      : exp.inclusions;
  const whatToBring =
    loc === 'ar'
      ? exp.whatToBringAr.length > 0
        ? exp.whatToBringAr
        : exp.whatToBring.map(toArabicText)
      : exp.whatToBring;
  const maxGroupSize = formatInteger(exp.maxGroupSize, loc);
  const minAge = formatInteger(exp.minAge, loc);
  const bookingCopy = {
    title: tb('title'),
    editDetails: tb('editDetails'),
    name: tb('name'),
    phone: tb('phone'),
    email: tb('email'),
    emailHint: tb('emailHint'),
    emailInvalid: tb('emailInvalid'),
    preferredDate: tb('preferredDate'),
    partySize: tb('partySize'),
    phoneHint: tb('phoneHint'),
    countryLabel: tb('countryLabel'),
    phonePlaceholder: tb('phonePlaceholder'),
    phoneInvalid: tb('phoneInvalid'),
    preferredDateHint: tb('preferredDateHint'),
    partySizeHint: tb('partySizeHint', { max: exp.maxGroupSize }),
    submit: exp.bookingMode === 'instant' ? tb('submitInstant') : tb('submit'),
    pending: tb('pending'),
    validation: tb('validation'),
    server: tb('server'),
    notFound: tb('notFound'),
    suspended: tb('suspended'),
    tooMany: tb('tooMany'),
    required: tb('required'),
    datePast: tb('datePast'),
    dateUnavailable: tb('dateUnavailable'),
    dateFull: tb('dateFull'),
    partySizeTooLarge: tb('partySizeTooLarge'),
    datePlaceholder: tb('datePlaceholder'),
    total: tb('total'),
    // Null while the VAT toggle is off — the form renders no VAT line.
    vatIncluded: settings.vatEnabled
      ? tb('vatIncluded', { pct: vatRatePercent(settings.vatRateBps) })
      : null,
    decrease: tb('decrease'),
    increase: tb('increase'),
    noDates: tb('noDates'),
    prevMonth: tb('prevMonth'),
    nextMonth: tb('nextMonth'),
  };
  // The request-mode note names the real approval window so guest
  // expectations match the platform setting, not stale copy. The
  // cancellation chip reflects the platform-wide refund rule (the one
  // the cancel action actually enforces).
  const modeNote =
    exp.bookingMode === 'instant'
      ? tb('modeInstant')
      : tb('modeRequest', { hours: settings.approvalWindowHours });
  const BOOKED_COUNT_MIN = 10; // owner-approved social-proof floor
  const bookedCountChip =
    completedCount >= BOOKED_COUNT_MIN
      ? t('bookedCount', { count: Math.floor(completedCount / 10) * 10 })
      : null;

  // Set date expectations up front: when an experience runs only on certain
  // weekdays, name them so the mostly-greyed calendar reads as intentional.
  // 2024-01-07 is a Sunday (UTC); weekday index 0=Sun..6=Sat.
  const weekdaySet = schedule?.availabilityWeekdays ?? [];
  const scheduleNote =
    availableDates.length > 0 && weekdaySet.length > 0 && weekdaySet.length < 7
      ? tb('runsOn', {
          days: new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' }).format(
            [...weekdaySet]
              .sort((a, b) => a - b)
              .map((wd) =>
                formatDate(new Date(Date.UTC(2024, 0, 7 + wd, 12)), loc, 'gregory', {
                  weekday: 'long',
                  timeZone: 'UTC',
                }),
              ),
          ),
        })
      : undefined;
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const category = CATEGORIES.find((c) => c.key === exp.category);
  const categoryLabel = category
    ? loc === 'ar'
      ? category.labelAr
      : category.labelEn
    : exp.category;

  // Icon-led "at a glance" facts — the at-a-glance contract a guest scans
  // before reading prose (duration / start / group / age). Values are
  // ICU/locale-formatted here so the client never re-formats.
  const highlights = [
    {
      key: 'duration',
      Icon: Clock,
      label: t('highlights.duration'),
      value: `${durationHours(exp.durationMinutes, loc)} ${te('hours')}`,
    },
    {
      key: 'starts',
      Icon: Sunrise,
      label: t('highlights.starts'),
      value: formatTime(new Date(`2000-01-01T${exp.startTime}:00`), loc),
    },
    {
      key: 'group',
      Icon: Users,
      label: t('highlights.group'),
      value: t('highlights.groupValue', { count: maxGroupSize }),
    },
    { key: 'age', Icon: Cake, label: t('highlights.age'), value: minAge },
  ];

  const url = `${SITE_URL}/${loc}/experiences/${exp.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        name: title,
        description,
        category: categoryLabel,
        url,
        brand: { '@type': 'Organization', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          price: exp.priceSar,
          priceCurrency: 'SAR',
          availability: 'https://schema.org/InStock',
          url,
        },
        ...(ratingAggregate.count > 0 && ratingAggregate.average !== null
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(ratingAggregate.average.toFixed(1)),
                reviewCount: ratingAggregate.count,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: `${SITE_URL}/${loc}`,
          },
          { '@type': 'ListItem', position: 2, name: title, item: url },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-12">
      {/* Draft content emits no structured data — crawlers shouldn't see it. */}
      {!previewMode && <JsonLd data={jsonLd} />}
      {previewMode && (
        <p
          role="status"
          className="border-saffron-gold/50 bg-saffron-gold/10 text-sarat-black rounded-card mb-6 [border-width:0.5px] p-4 text-sm leading-relaxed"
        >
          {t('preview.banner')}
        </p>
      )}
      <Link
        href="/experiences"
        className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 text-sm transition-opacity duration-200 hover:opacity-60"
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        {t('back')}
      </Link>

      {/* Hero + gallery. The hero stays the LCP 16:9 frame; the lightbox
          shows every photo (hero + gallery) in full via object-contain,
          which is where mixed portrait/landscape orientation belongs. */}
      <PhotoGallery
        heroImage={exp.heroImage}
        images={exp.images}
        alt={title}
        locale={loc}
        copy={{
          open: t('gallery.open'),
          count: t('gallery.count'),
          close: t('gallery.close'),
          prev: t('gallery.prev'),
          next: t('gallery.next'),
          goTo: t('gallery.goTo', { n: '{n}' }),
        }}
      />

      <header className="mt-10 flex flex-col gap-3">
        <span className={eyebrowClassName}>{exp.featured ? te('originals') : categoryLabel}</span>
        <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
          {title}
        </h1>
        <p className="text-sarat-black-600 flex items-center gap-2 text-base">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span>
            {placeName} · {location}
          </span>
        </p>
      </header>

      {/* Icon-led quick facts — duration / start time / group / min age were
          previously buried in a dot-separated run-on string or the booking
          panel's small print. Surfacing them as a scannable row is the
          at-a-glance contract a guest reads before committing. */}
      <section
        aria-label={t('highlights.heading')}
        className="border-sarat-black/8 mt-8 grid grid-cols-2 gap-x-6 gap-y-5 [border-block-width:0.5px] py-8 sm:grid-cols-4"
      >
        {highlights.map(({ key, Icon, label, value }) => (
          <div key={key} className="flex items-center gap-3">
            <Icon className="text-saffron-gold size-5 shrink-0" aria-hidden />
            <div className="flex flex-col">
              <span className="text-sarat-black-600 text-xs">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        {/* Left: content */}
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('about')}</h2>
            {/* ~65–75ch measure: long prose past 80ch is fatiguing to track. */}
            <p className="text-sarat-black-600 max-w-[68ch] text-lg leading-relaxed">
              {description}
            </p>
          </section>

          {exp.moments.length > 0 && (
            <section className="flex flex-col gap-5">
              <FadeIn>
                <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                  {t('timeline')}
                </h2>
              </FadeIn>
              {/* Each moment springs in in sequence; the connector rail draws
                  itself down as it scrolls into view — one read-as-a-journey
                  timeline. */}
              <Stagger>
                <ol className="flex flex-col">
                  {exp.moments.map((m, i, arr) => (
                    <li key={m.orderIndex}>
                      <StaggerItem className="grid grid-cols-[auto_1fr] gap-x-4">
                        <div className="flex flex-col items-center" aria-hidden>
                          <span className="bg-saffron-gold ring-saffron-gold/15 mt-1.5 size-2.5 shrink-0 rounded-full ring-4" />
                          {i < arr.length - 1 && (
                            <Draw className="mt-1 w-px flex-1">
                              <span className="bg-sarat-black/10 block size-full" />
                            </Draw>
                          )}
                        </div>
                        <div className={cn('flex flex-col gap-1', i < arr.length - 1 && 'pb-7')}>
                          <span className={eyebrowClassName}>
                            {loc === 'ar' ? toArabicText(m.timeOfDay) : m.timeOfDay}
                          </span>
                          <span className="text-lg font-medium">
                            {loc === 'ar' ? m.titleAr : m.titleEn}
                          </span>
                          <span className="text-sarat-black-600 max-w-[68ch] text-base">
                            {loc === 'ar' ? m.descriptionAr : m.descriptionEn}
                          </span>
                        </div>
                      </StaggerItem>
                    </li>
                  ))}
                </ol>
              </Stagger>
            </section>
          )}

          {inclusions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('included')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2.5 text-base">
                {inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="text-saffron-gold mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {whatToBring.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display flex items-center gap-2.5 text-2xl font-medium tracking-[-0.025em]">
                <Backpack className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
                {t('bring')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2.5 text-base">
                {whatToBring.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      className="bg-sarat-black-400 mt-2 size-1.5 shrink-0 rounded-full"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-display flex items-center gap-2.5 text-2xl font-medium tracking-[-0.025em]">
              <MapPin className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
              {t('meetingPoint.heading')}
            </h2>
            <MeetingPointMap
              lat={exp.lat}
              lng={exp.lng}
              placeName={placeName}
              location={location}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display flex items-center gap-2.5 text-2xl font-medium tracking-[-0.025em]">
              <ShieldCheck className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
              {t('cancellation')}
            </h2>
            {/* Single source of truth: the line is DERIVED from the
                platform window the cancel action actually enforces. The
                host's free-text policy field is no longer rendered here —
                sample listings promised 24/72h windows while enforcement
                was 48h, a refund dispute waiting to happen. */}
            <p className="text-sarat-black-600 text-base">
              {settings.cancellationWindowHours > 0
                ? t('cancellationPolicyLine', { hours: settings.cancellationWindowHours })
                : t('cancellationPolicyNone')}
            </p>
          </section>

          <section className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-10">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('hostedBy')}
            </h2>
            <HostCard host={exp.host} locale={loc} responseStats={hostResponseStats} />
          </section>

          <ReviewsSection
            experienceSlug={exp.slug}
            locale={loc}
            showAll={showAllReviews}
            showAllHref={`/experiences/${exp.slug}?reviews=all#reviews`}
          />
        </div>

        {/* Right: sticky price / booking panel. On short viewports the panel
            can be taller than the screen, so it scrolls within itself —
            keeping the submit button reachable without scrolling the page. */}
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <MountFade
            eager
            className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6"
          >
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{tb('title')}</h2>
            <p className="text-2xl font-medium">
              <Price amount={exp.priceSar} locale={loc} />
              <span className="text-sarat-black-600 text-base font-normal"> {te('perPerson')}</span>
            </p>
            {/* Trust chips — booking type, refund rule, social proof. */}
            <div className="flex flex-wrap gap-2">
              {exp.bookingMode === 'instant' ? (
                <Badge className="bg-saffron-gold/20 text-sarat-black">
                  <Zap aria-hidden />
                  {t('instantBadge')}
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <CalendarClock aria-hidden />
                  {t('requestBadge')}
                </Badge>
              )}
              {settings.cancellationWindowHours > 0 && (
                <Badge className="bg-success-surface text-success">
                  <ShieldCheck aria-hidden />
                  {t('freeCancellation', { hours: settings.cancellationWindowHours })}
                </Badge>
              )}
              {bookedCountChip && (
                <Badge variant="neutral">
                  <Users aria-hidden />
                  {bookedCountChip}
                </Badge>
              )}
            </div>
            <div className="text-sarat-black-600 flex flex-col gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Sunrise className="size-4 shrink-0" aria-hidden />
                {t('startsAt', {
                  time: formatTime(new Date(`2000-01-01T${exp.startTime}:00`), loc),
                })}
              </span>
              <span className="flex items-center gap-2">
                <Users className="size-4 shrink-0" aria-hidden />
                {t('groupSizeUpTo', { count: maxGroupSize })}
              </span>
              <span className="flex items-center gap-2">
                <Cake className="size-4 shrink-0" aria-hidden />
                {t('minAge', { age: minAge })}
              </span>
            </div>
            {previewMode ? (
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t('preview.bookingDisabled')}
              </p>
            ) : (
              <BookingRequestForm
                experienceSlug={exp.slug}
                locale={loc}
                maxGroupSize={String(exp.maxGroupSize)}
                priceSar={exp.priceSar}
                known={knownGuest}
                minDate={todayRiyadh}
                maxDate={addDays(todayRiyadh, BOOKING_HORIZON_DAYS)}
                availableDates={availableDates}
                modeNote={modeNote}
                scheduleNote={scheduleNote}
                initialDate={initialDate}
                initialPartySize={initialPartySize}
                vatRateBps={settings.vatEnabled ? settings.vatRateBps : null}
                copy={bookingCopy}
              />
            )}
          </MountFade>
        </aside>
      </div>
    </article>
  );
}
