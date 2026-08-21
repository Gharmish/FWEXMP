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
  Star,
  Sunrise,
  Users,
  Venus,
  Zap,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { durationHours, formatInteger, formatDate, formatTime } from '@/lib/format';
import { startInstant } from '@/features/bookings/lib/cancellation';

/**
 * Any Riyadh calendar day, used purely to turn an `HH:mm` catalogue
 * time into an instant `formatTime` can render. The date is discarded;
 * what matters is that the clock time is pinned to Asia/Riyadh, because
 * `formatTime` always formats IN Riyadh — so a server-local parse on a
 * UTC host printed every advertised start time three hours late.
 */
const RIYADH_CLOCK_ANCHOR = '2000-01-01';
import { Price } from '@/components/ui/price';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { JsonLd } from '@/components/seo/json-ld';
import { BookingRequestForm } from '@/features/bookings/components/booking-request-form';
import { ExperienceViewTracking } from '@/features/experiences/components/experience-view-tracking';
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
import { bookingOptions } from '@/features/bookings/lib/policy';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { policyWindow } from '@/features/bookings/lib/policy-copy';
import { vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getCompletedBookingsCountForExperience } from '@/features/bookings/queries';
import { getHostResponseStats } from '@/features/hosts/queries';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { ReviewsSection } from '@/features/reviews/components/reviews-section';
import { getReviewAggregateForExperience } from '@/features/reviews/queries';
import { RelatedExperiences } from '@/features/experiences/components/related-experiences';
import { CategoryLanding } from '@/features/experiences/components/category-landing';
import { categoryFromUrlSlug } from '@/features/experiences/lib/category-landing';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { getWishlistSet } from '@/features/wishlist/queries';
import { PaymentMarks } from '@/components/layout/payment-marks';
import { Draw, FadeIn, MountFade, Stagger, StaggerItem } from '@/components/ui/motion';
import type { Category } from '@/features/experiences/types';

/**
 * Categories whose experiences run outdoors, where a weather call is a
 * live possibility — these get the weather note under the cancellation
 * policy. Category is a proxy (no per-experience flag): wellness or
 * heritage sessions can happen outside too, but the platform-wide
 * weather section on /cancellation-policy covers everyone regardless.
 */
const OUTDOOR_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['nature', 'adventure']);

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

/**
 * Host-authored descriptions are DB free text with no length guarantee.
 * Clamp to ~160 characters at a word boundary so the SERP snippet never
 * gets machine-truncated mid-word. (Same rule as hosts/[slug].)
 */
const META_DESCRIPTION_MAX = 160;

function clampDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= META_DESCRIPTION_MAX) return normalized;
  const cut = normalized.slice(0, META_DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Category landings share this URL level (see category-landing.ts) —
  // their metadata is editorial, self-canonical, and locale-alternated.
  const landingCategory = categoryFromUrlSlug(slug);
  if (landingCategory) {
    const t = await getTranslations({ locale, namespace: 'categoryLanding' });
    const landingPath = (l: string) => `${SITE_URL}/${l}/experiences/${slug}`;
    return {
      title: t(`${landingCategory}.title`),
      description: t(`${landingCategory}.intro`),
      alternates: {
        canonical: landingPath(locale),
        languages: {
          ...Object.fromEntries(routing.locales.map((l) => [l, landingPath(l)])),
          'x-default': landingPath('ar'),
        },
      },
      openGraph: {
        title: t(`${landingCategory}.title`),
        description: t(`${landingCategory}.intro`),
        url: landingPath(locale),
        type: 'website',
        images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        title: t(`${landingCategory}.title`),
        description: t(`${landingCategory}.intro`),
        images: [`${SITE_URL}/${locale}/opengraph-image`],
      },
    };
  }
  const exp = await getExperienceBySlug(slug);
  if (!exp) return {};
  const title = locale === 'ar' ? exp.titleAr : exp.titleEn;
  const description = clampDescription(locale === 'ar' ? exp.descriptionAr : exp.descriptionEn);
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
  // Category landing dispatch — `/experiences/nature` etc. share this URL
  // level with listing slugs (one dynamic segment name per level); a
  // category match renders the editorial landing, anything else falls
  // through to the detail flow and its 404 semantics.
  const landingCategory = categoryFromUrlSlug(slug);
  if (landingCategory) {
    return <CategoryLanding category={landingCategory} locale={loc} />;
  }
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
    await trackExperienceView({
      experienceSlug: exp.slug,
      locale: loc,
      utm: utmFromSearchParams(sp),
    });
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
  // Current KSA wall-clock (minutes since midnight) so the picker greys out
  // today's slot once it's within the booking cutoff of its start time —
  // mirroring the same server-side gate in `requestBooking`.
  const nowRiyadhHm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const [nowRiyadhH, nowRiyadhM] = nowRiyadhHm.split(':').map(Number);
  const nowMinutesRiyadh = nowRiyadhH * 60 + nowRiyadhM;
  // DB reads go out in WAVES OF ≤4, never one wide Promise.all — the same
  // rule the admin dashboard already follows. The postgres.js pool is
  // `max: 5` per lambda (lib/db.ts), and a `boundedQuery` deadline starts
  // when its promise is CREATED, not when it acquires a connection. So a
  // fan-out wider than the pool makes the queued tail burn its whole 8s
  // deadline waiting for a slot, time out, and abandon the connection —
  // which is precisely how this page came to render in ~9s while every
  // query it runs measures under 20ms server-side (2026-08-08).
  //
  // Translations are not DB work and hold no connection, so they ride
  // along with the first wave for free.
  const [t, te, tb, tTiers, tFooter] = await Promise.all([
    getTranslations('experienceDetail'),
    getTranslations('experience'),
    getTranslations('bookingRequest'),
    getTranslations('cancellationTiers'),
    getTranslations('footer'),
  ]);
  // Wave 1 — the four reads the page cannot render without. Each of these
  // is one connection at a time (getReviewAggregate/getScheduleDataBySlug
  // issue their lookup then their aggregate sequentially inside).
  const [ratingAggregate, schedule, settings, policyTiers] = await Promise.all([
    getReviewAggregateForExperience(slug),
    getScheduleDataBySlug(slug, todayRiyadh, addDays(todayRiyadh, BOOKING_HORIZON_DAYS)),
    getPlatformSettings(),
    // DB-backed tier parameters — the same rows booking creation snapshots.
    getCancellationTiers(),
  ]);
  // Wave 2 — social proof and prefill. Nothing above depends on these, so
  // they are deferred rather than dropped.
  const [completedCount, hostResponseStats, knownGuest] = await Promise.all([
    getCompletedBookingsCountForExperience(exp.slug),
    getHostResponseStats(exp.hostSlug),
    // Prefill for a returning/signed-in guest so they don't retype contact
    // details. Empty for a first-time visitor. Not needed in preview mode
    // (booking form is disabled), but cheap enough to always resolve.
    getKnownGuestDetails(),
  ]);
  // The tier's parameters — what new bookings will snapshot; drives the
  // cancellation section, the free-cancellation trust chip, and the
  // per-date deadline notes below. The `moderate` fallback covers detail
  // objects cached (unstable_cache) before the tier field existed.
  const policyView = policyTiers[exp.cancellationTier] ?? policyTiers.moderate;

  // The exact cancellation deadline a booking made NOW on a given date
  // would carry — the same `bookingOptions` projection the payment page
  // renders, so "until 24 hours before" becomes a concrete date + time
  // the moment the guest picks a day. One `now` for the whole list keeps
  // the notes mutually consistent within the request.
  const projectionNow = new Date();
  const formatDeadline = (deadline: Date) =>
    loc === 'ar'
      ? `${formatDate(deadline, loc)}، ${formatTime(deadline, loc)}`
      : `${formatDate(deadline, loc)}, ${formatTime(deadline, loc)}`;
  const cancellationNoteFor = (dateStr: string, startTime: string): string => {
    const projected = bookingOptions({
      status: 'confirmed',
      // Projected as already paid so the note covers the post-booking
      // grace and the tier's partial step — never just the free window.
      paymentStatus: 'paid',
      dateStr,
      startTime,
      createdAt: projectionNow,
      // The note speaks in percentages, not amounts (the total depends on
      // the party size the guest hasn't picked yet) — the refund base is
      // irrelevant here.
      totalAmountSar: 0,
      snapshot: policyView,
      rescheduleCount: 0,
      now: projectionNow,
    }).cancel;
    if (!projected.allowed) return tb('cancellationNoRefund');
    if (projected.refund === 'full' || projected.refund === 'none_needed') {
      return tb('cancellationFreeUntil', { deadline: formatDeadline(projected.fullRefundUntil) });
    }
    if (projected.refund === 'partial' && projected.partialDeadline) {
      return tb('cancellationPartialUntil', {
        percent: policyView.partialRefundBps / 100,
        deadline: formatDeadline(projected.partialDeadline),
      });
    }
    return tb('cancellationNoRefund');
  };

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
          startTime: schedule.startTime,
          nowMinutes: nowMinutesRiyadh,
          cutoffMinutes: schedule.bookingCutoffHours * 60,
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
    // Scarcity only reads as scarcity when it's true: a raw "14 spots left"
    // is an abundance signal, so the count only shows at <= 4 remaining.
    spotsLabel: d.remaining <= 4 ? tb('spotsLeft', { count: d.remaining }) : tb('available'),
    // `schedule` is necessarily non-null when the list has entries, but the
    // narrowing doesn't cross the callback boundary — re-check instead of `!`.
    cancellationNote: schedule ? cancellationNoteFor(d.date, schedule.startTime) : undefined,
  }));

  const title = loc === 'ar' ? exp.titleAr : exp.titleEn;
  const description = loc === 'ar' ? exp.descriptionAr : exp.descriptionEn;
  // Optional editorial story — null/undefined (sample path) hides the section.
  const story = (loc === 'ar' ? exp.storyAr : exp.storyEn)?.trim() || null;
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
  // Instant book and request-to-book share one form, but the copy must not
  // leak between modes: an instant listing never says "request", a request
  // listing never promises immediate confirmation.
  const isInstant = exp.bookingMode === 'instant';
  const bookingCopy = {
    title: isInstant ? tb('titleInstant') : tb('title'),
    editDetails: tb('editDetails'),
    name: tb('name'),
    phone: tb('phone'),
    email: tb('email'),
    emailHint: tb('emailHint'),
    emailInvalid: tb('emailInvalid'),
    preferredDate: isInstant ? tb('preferredDateInstant') : tb('preferredDate'),
    partySize: tb('partySize'),
    phoneHint: tb('phoneHint'),
    countryLabel: tb('countryLabel'),
    phonePlaceholder: tb('phonePlaceholder'),
    phoneInvalid: tb('phoneInvalid'),
    preferredDateHint: isInstant
      ? tb('preferredDateHintInstant')
      : tb('preferredDateHint', { hours: settings.approvalWindowHours }),
    partySizeHint: tb('partySizeHint', { max: exp.maxGroupSize }),
    submit: isInstant ? tb('submitInstant') : tb('submit'),
    pending: isInstant ? tb('pendingInstant') : tb('pending'),
    validation: tb('validation'),
    server: tb('server'),
    notFound: tb('notFound'),
    suspended: tb('suspended'),
    tooMany: tb('tooMany'),
    tooManyFinish: tb('tooManyFinish'),
    tooManyHint: tb('tooManyHint'),
    tooManyStatusPayment: tb('tooManyStatusPayment'),
    tooManyStatusApproval: tb('tooManyStatusApproval'),
    tooManyStatusConfirmed: tb('tooManyStatusConfirmed'),
    required: tb('required'),
    nameRequired: tb('nameRequired'),
    phoneRequired: tb('phoneRequired'),
    emailRequired: tb('emailRequired'),
    datePast: tb('datePast'),
    dateUnavailable: tb('dateUnavailable'),
    dateCutoff: tb('dateCutoff'),
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
    womenOnlyLabel: tb('womenOnlyLabel'),
    womenOnlyRequired: tb('womenOnlyRequired'),
    minAgeLabel: tb('minAgeLabel', { age: exp.minAge }),
    minAgeRequired: tb('minAgeRequired'),
    termsRequired: tb('termsRequired'),
    marketingConsentLabel: tb('marketingConsentLabel'),
  };
  // Clickwrap consent line with inline links to each binding document —
  // required at the booking step, not only at checkout (2026-08-02 legal
  // audit): request-to-book guests may never reach the payment page.
  const consentLinkClassName =
    'font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60';
  const termsLabel = tb.rich('termsLabel', {
    terms: (chunks) => (
      <Link href="/terms" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
    privacy: (chunks) => (
      <Link href="/privacy" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
    cancellation: (chunks) => (
      <Link href="/cancellation-policy" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
  });
  // The request-mode note names the real approval window so guest
  // expectations match the platform setting, not stale copy. The
  // cancellation chip reflects the platform-wide refund rule (the one
  // the cancel action actually enforces).
  const modeNote = isInstant
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
    'text-sarat-black-600 font-medium text-[11px]',
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
      value: formatTime(startInstant(RIYADH_CLOCK_ANCHOR, exp.startTime), loc),
    },
    {
      key: 'group',
      Icon: Users,
      label: t('highlights.group'),
      value: t('highlights.groupValue', { count: maxGroupSize }),
    },
    {
      key: 'age',
      Icon: Cake,
      label: t('highlights.age'),
      // "Min age 0" reads as a data glitch — say what it means instead.
      value: exp.minAge > 0 ? minAge : t('highlights.ageAll'),
    },
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
        // `image` is REQUIRED for Product rich results (2026-08-02 ops
        // audit) — without it Google never shows price/stars in the
        // SERP. Hero when it's an absolute URL; otherwise the rendered
        // OG card, which always exists for a live listing.
        image: [exp.heroImage?.startsWith('http') ? exp.heroImage : `${url}/card.png`],
        brand: { '@type': 'Organization', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          price: exp.priceSar,
          priceCurrency: 'SAR',
          // Honest stock signal (2026-08-02 ops audit): hardcoded
          // InStock told crawlers a fully stop-sold/booked-out listing
          // was buyable — a structured-data-mismatch penalty risk.
          availability:
            availableDates.length > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
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
          // The middle level earns the SERP breadcrumb trail ("Gharmish ›
          // Experiences › …") and links equity back to the catalog hub.
          {
            '@type': 'ListItem',
            position: 2,
            name: t('breadcrumbCatalog'),
            item: `${SITE_URL}/${loc}/experiences`,
          },
          { '@type': 'ListItem', position: 3, name: title, item: url },
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
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/experiences"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 text-sm transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('back')}
        </Link>
        {/* Draft previews are only readable by their owner — a shared
            link would 404 for everyone else, so no share affordance. */}
        {!previewMode && (
          <div className="flex items-center gap-2">
            {/* Save-for-later at the exact moment of hesitation — the
                catalog and home already offer it; losing it on click-through
                was a gap. Static placement (no absolute corner) because this
                bar isn't an image card. */}
            <WishlistButton
              slug={exp.slug}
              isSaved={(await getWishlistSet()).has(exp.slug)}
              surface="light"
            />
            <ShareButton
              url={`${SITE_URL}/${loc}/experiences/${exp.slug}`}
              title={loc === 'ar' ? exp.titleAr : exp.titleEn}
              contentType="experience"
              analyticsId={exp.slug}
            />
          </div>
        )}
      </div>

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
        {/* Rating above the fold: the catalog card shows stars, so losing
            them on click-through inverted the social-proof gradient. Anchor
            links straight to the reviews section. Hidden at zero reviews —
            no fake proof. */}
        {ratingAggregate.count > 0 && ratingAggregate.average !== null && (
          <a
            href="#reviews"
            className="flex items-center gap-1.5 self-start text-sm font-medium underline-offset-4 transition-opacity duration-200 hover:opacity-60"
          >
            <Star className="text-saffron-gold size-4 shrink-0 fill-current" aria-hidden />
            {t('ratingSummary', {
              rating: ratingAggregate.average.toFixed(1),
              count: ratingAggregate.count,
            })}
          </a>
        )}
        {/* Women-only experiences flag the restriction up front — before the
            guest invests in the booking flow (the booking form also requires
            an eligibility acknowledgment). Category tint per BRIEF §3. */}
        {exp.category === 'women_only' && (
          <Badge className="bg-tihama-coral/20 text-tihama-coral-800 self-start">
            <Venus aria-hidden />
            {t('womenOnlyBadge')}
          </Badge>
        )}
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

      {/* Both tracks are minmax(0,…), never a bare `1fr` or an implicit
          `auto`. A grid item defaults to `min-width: auto`, i.e. it refuses
          to shrink below its own min-content, and an `auto`/`1fr` track
          honours that floor — so one long unbreakable string anywhere in
          this subtree widens the column past its container and the whole
          document scrolls sideways. Flooring at 0 makes the track win and
          the content wrap instead. Latent until some copy trips it, which
          is why it must not depend on today's strings (2026-08-08). */}
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: content. `min-w-0` is load-bearing, not cosmetic: a grid
            item defaults to `min-width: auto` and so refuses to shrink below
            its own min-content, overflowing the track no matter how the
            track is sized. Flooring the track alone does NOT fix that —
            measured. */}
        <div className="flex min-w-0 flex-col gap-12">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('about')}</h2>
            {/* ~65–75ch measure: long prose past 80ch is fatiguing to track. */}
            <p className="text-sarat-black-600 max-w-[68ch] text-lg leading-relaxed">
              {description}
            </p>
          </section>

          {/* The story behind this experience — optional editorial prose;
              renders only when real content exists (no fabrication). */}
          {story && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('story')}
              </h2>
              <p className="text-sarat-black-600 max-w-[68ch] text-lg leading-relaxed">{story}</p>
            </section>
          )}

          {/* Your host — the person early in the read (brand hierarchy:
              guest → host → place; the host is the way in, not a footnote
              below the cancellation policy). */}
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('hostedBy')}
            </h2>
            <HostCard host={exp.host} locale={loc} responseStats={hostResponseStats} />
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
                experience's policy tier — the exact parameters every new
                booking snapshots and the cancel/reschedule actions
                enforce. Free text is never rendered here. */}
            <p className="text-sarat-black-600 text-base">
              {policyView.partialRefundBps > 0
                ? t('cancellationTierLine', {
                    freeWindow: policyWindow(policyView.freeCancelHours, tTiers),
                    partialPct: policyView.partialRefundBps / 100,
                    partialWindow: policyWindow(policyView.partialRefundHours, tTiers),
                    rescheduleWindow: policyWindow(policyView.rescheduleCutoffHours, tTiers),
                  })
                : t('cancellationTierLineNoPartial', {
                    freeWindow: policyWindow(policyView.freeCancelHours, tTiers),
                    rescheduleWindow: policyWindow(policyView.rescheduleCutoffHours, tTiers),
                  })}
            </p>
            {OUTDOOR_CATEGORIES.has(exp.category) && (
              <p className="text-sarat-black-600 text-base">
                {t.rich('weatherNote', {
                  policy: (chunks) => (
                    <Link href="/cancellation-policy" className={consentLinkClassName}>
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </section>

          <ReviewsSection
            experienceSlug={exp.slug}
            locale={loc}
            // Reuse the wave-1 aggregate the JSON-LD above already needed,
            // instead of letting this section re-read it.
            aggregate={ratingAggregate}
            showAll={showAllReviews}
            showAllHref={`/experiences/${exp.slug}?reviews=all#reviews`}
          />
        </div>

        {/* Right: sticky price / booking panel. On short viewports the panel
            can be taller than the screen, so it scrolls within itself —
            keeping the submit button reachable without scrolling the page. */}
        <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <MountFade
            eager
            className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6"
          >
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {bookingCopy.title}
            </h2>
            <p className="text-2xl font-medium">
              <Price amount={exp.priceSar} locale={loc} />
              <span className="text-sarat-black-600 text-base font-normal"> {te('perPerson')}</span>
            </p>
            {/* Same above-the-fold rating as the header — the panel is where
                the commit decision happens, so proof belongs beside price. */}
            {ratingAggregate.count > 0 && ratingAggregate.average !== null && (
              <a
                href="#reviews"
                className="-mt-3 flex items-center gap-1.5 self-start text-sm font-medium underline-offset-4 transition-opacity duration-200 hover:opacity-60"
              >
                <Star className="text-saffron-gold size-4 shrink-0 fill-current" aria-hidden />
                {t('ratingSummary', {
                  rating: ratingAggregate.average.toFixed(1),
                  count: ratingAggregate.count,
                })}
              </a>
            )}
            {/* Trust chips — booking type, refund rule, social proof. */}
            <div className="flex flex-wrap gap-2">
              {isInstant ? (
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
              <Badge className="bg-success-surface text-success">
                <ShieldCheck aria-hidden />
                {/* Multi-day windows read as days ("7 days", like the tier
                    copy everywhere else), never as "168h" — policyWindow
                    owns that rule. */}
                {t('freeCancellationBadge', {
                  window: policyWindow(policyView.freeCancelHours, tTiers),
                })}
              </Badge>
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
                  time: formatTime(startInstant(RIYADH_CLOCK_ANCHOR, exp.startTime), loc),
                })}
              </span>
              <span className="flex items-center gap-2">
                <Users className="size-4 shrink-0" aria-hidden />
                {t('groupSizeUpTo', { count: maxGroupSize })}
              </span>
              <span className="flex items-center gap-2">
                <Cake className="size-4 shrink-0" aria-hidden />
                {exp.minAge > 0 ? t('minAge', { age: minAge }) : t('minAgeAll')}
              </span>
            </div>
            {!previewMode && <ExperienceViewTracking slug={exp.slug} priceSar={exp.priceSar} />}
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
                requireWomenOnly={exp.category === 'women_only'}
                requireMinAge={exp.minAge > 0}
                termsLabel={termsLabel}
                copy={bookingCopy}
              />
            )}
            {/* Accepted-payment marks at the decision point — previously
                only on the pay page and footer, i.e. after the commitment. */}
            {!previewMode && (
              <PaymentMarks
                label={tFooter('paymentsLabel')}
                names={{
                  mada: tFooter('brandMada'),
                  visa: tFooter('brandVisa'),
                  mastercard: tFooter('brandMastercard'),
                  applePay: tFooter('brandApplePay'),
                }}
              />
            )}
          </MountFade>
        </aside>
      </div>

      {/* Cross-sell where journeys otherwise dead-end: below the fold for
          browsing guests, and the only forward path when every date is sold
          out. Never shown on owner previews (draft catalogs are private). */}
      {!previewMode && (
        <RelatedExperiences
          excludeSlug={exp.slug}
          city={exp.city}
          category={exp.category}
          locale={loc}
        />
      )}
    </article>
  );
}
