import type { Metadata } from 'next';
import { ArrowLeft, CalendarClock, ShieldCheck, Users, Zap } from 'lucide-react';
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
import { HostCard } from '@/features/hosts/components/host-card';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getAllSlugs, getExperienceBySlug } from '@/features/experiences/queries';
import { PhotoGallery } from '@/features/experiences/components/photo-gallery';
import { MeetingPointMap } from '@/features/experiences/components/meeting-point-map';
import { getScheduleDataBySlug } from '@/features/availability/queries';
import { addDays, bookableDates } from '@/features/bookings/lib/availability';
import { vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/features/admin/settings/queries';
import { getCompletedBookingsCountForExperience } from '@/features/bookings/queries';
import { getHostResponseStats } from '@/features/hosts/queries';
import { Badge } from '@/components/ui/badge';
import { ReviewsSection } from '@/features/reviews/components/reviews-section';
import { getReviewAggregateForExperience } from '@/features/reviews/queries';
import { FadeIn } from '@/components/ui/motion';

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
      images: [{ url: `${SITE_URL}/images/gharmish-og.png`, width: 1200, height: 630 }],
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

  const exp = await getExperienceBySlug(slug);
  if (!exp) notFound();

  // Fetch the aggregate rating in parallel with translation setup — it
  // feeds both the JSON-LD AggregateRating and the visible reviews
  // section (which re-fetches the full list itself, also cached).
  const ratingAggregate = await getReviewAggregateForExperience(slug);

  const t = await getTranslations('experienceDetail');
  const te = await getTranslations('experience');
  const tb = await getTranslations('bookingRequest');

  // Build the guest date picker: only dates that are actually bookable
  // (open weekday, not blackout/stop-sell/past, with capacity) over the
  // next ~8 weeks, each with its remaining-spots count.
  const BOOKING_HORIZON_DAYS = 60;
  const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
    new Date(),
  );
  const schedule = await getScheduleDataBySlug(
    slug,
    todayRiyadh,
    addDays(todayRiyadh, BOOKING_HORIZON_DAYS),
  );
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
  const inclusions = loc === 'ar' ? exp.inclusions.map(toArabicText) : exp.inclusions;
  const whatToBring = loc === 'ar' ? exp.whatToBring.map(toArabicText) : exp.whatToBring;
  const maxGroupSize = formatInteger(exp.maxGroupSize, loc);
  const minAge = formatInteger(exp.minAge, loc);
  const bookingCopy = {
    title: tb('title'),
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
    vatIncluded: tb('vatIncluded', { pct: vatRatePercent() }),
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
  const [settings, completedCount, hostResponseStats] = await Promise.all([
    getPlatformSettings(),
    getCompletedBookingsCountForExperience(exp.slug),
    getHostResponseStats(exp.hostSlug),
  ]);
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
      <JsonLd data={jsonLd} />
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
        }}
      />

      <header className="border-sarat-black/8 mt-10 flex flex-col gap-3 [border-bottom-width:0.5px] pb-10">
        <span className={eyebrowClassName}>{exp.featured ? te('originals') : categoryLabel}</span>
        <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
          {title}
        </h1>
        <div className="text-sarat-black-600 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base">
          <span>{placeName}</span>
          <span aria-hidden>·</span>
          <span>{location}</span>
          <span aria-hidden>·</span>
          <span>
            {durationHours(exp.durationMinutes, loc)} {te('hours')}
          </span>
          <span aria-hidden>·</span>
          {/* A guest must know whether this is a dawn walk or an evening
              trip BEFORE committing — the time was previously invisible
              until the e-ticket. */}
          <span>
            {t('startsAt', {
              time: formatTime(new Date(`2000-01-01T${exp.startTime}:00`), loc),
            })}
          </span>
          <span aria-hidden>·</span>
          <span>{t('groupSizeUpTo', { count: maxGroupSize })}</span>
        </div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        {/* Left: content */}
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('about')}</h2>
            <p className="text-sarat-black-600 text-lg">{description}</p>
          </section>

          <FadeIn>
            <section className="flex flex-col gap-5">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('timeline')}
              </h2>
              <ol className="flex flex-col gap-5">
                {exp.moments.map((m) => (
                  <li key={m.orderIndex} className="flex flex-col gap-1">
                    <span className={eyebrowClassName}>
                      {loc === 'ar' ? toArabicText(m.timeOfDay) : m.timeOfDay}
                    </span>
                    <span className="text-lg font-medium">
                      {loc === 'ar' ? m.titleAr : m.titleEn}
                    </span>
                    <span className="text-sarat-black-600 text-base">
                      {loc === 'ar' ? m.descriptionAr : m.descriptionEn}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </FadeIn>

          {inclusions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('included')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2 text-base">
                {inclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {whatToBring.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('bring')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2 text-base">
                {whatToBring.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
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
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
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
          <div className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6">
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
            <div className="text-sarat-black-600 flex flex-col gap-1 text-sm">
              <span>
                {t('startsAt', {
                  time: formatTime(new Date(`2000-01-01T${exp.startTime}:00`), loc),
                })}
              </span>
              <span>{t('groupSizeUpTo', { count: maxGroupSize })}</span>
              <span>{t('minAge', { age: minAge })}</span>
            </div>
            <BookingRequestForm
              experienceSlug={exp.slug}
              locale={loc}
              maxGroupSize={String(exp.maxGroupSize)}
              priceSar={exp.priceSar}
              minDate={todayRiyadh}
              maxDate={addDays(todayRiyadh, BOOKING_HORIZON_DAYS)}
              availableDates={availableDates}
              modeNote={modeNote}
              scheduleNote={scheduleNote}
              copy={bookingCopy}
            />
          </div>
        </aside>
      </div>
    </article>
  );
}
