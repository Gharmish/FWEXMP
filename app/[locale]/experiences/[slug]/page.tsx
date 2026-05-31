import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { durationHours, formatInteger, formatDate } from '@/lib/format';
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
import { getScheduleDataBySlug } from '@/features/availability/queries';
import { addDays, bookableDates } from '@/features/bookings/lib/availability';
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
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

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
  const cancellationPolicy =
    loc === 'ar' ? toArabicText(exp.cancellationPolicy) : exp.cancellationPolicy;
  const maxGroupSize = formatInteger(exp.maxGroupSize, loc);
  const minAge = formatInteger(exp.minAge, loc);
  const bookingCopy = {
    title: tb('title'),
    name: tb('name'),
    phone: tb('phone'),
    preferredDate: tb('preferredDate'),
    partySize: tb('partySize'),
    phoneHint: tb('phoneHint'),
    preferredDateHint: tb('preferredDateHint'),
    partySizeHint: tb('partySizeHint', { max: exp.maxGroupSize }),
    submit: exp.bookingMode === 'instant' ? tb('submitInstant') : tb('submit'),
    pending: tb('pending'),
    validation: tb('validation'),
    server: tb('server'),
    notFound: tb('notFound'),
    required: tb('required'),
    datePast: tb('datePast'),
    dateUnavailable: tb('dateUnavailable'),
    dateFull: tb('dateFull'),
    partySizeTooLarge: tb('partySizeTooLarge'),
    datePlaceholder: tb('datePlaceholder'),
    total: tb('total'),
    decrease: tb('decrease'),
    increase: tb('increase'),
    noDates: tb('noDates'),
    prevMonth: tb('prevMonth'),
    nextMonth: tb('nextMonth'),
  };
  const modeNote = exp.bookingMode === 'instant' ? tb('modeInstant') : tb('modeRequest');
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
        <h1 className="font-display max-w-3xl text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
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
              {t('cancellation')}
            </h2>
            <p className="text-sarat-black-600 text-base">{cancellationPolicy}</p>
          </section>

          <section className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-10">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('hostedBy')}
            </h2>
            <HostCard host={exp.host} locale={loc} />
          </section>

          <ReviewsSection experienceSlug={exp.slug} locale={loc} />
        </div>

        {/* Right: sticky price / booking panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{tb('title')}</h2>
            <p className="text-2xl font-medium">
              <Price amount={exp.priceSar} locale={loc} />
              <span className="text-sarat-black-600 text-base font-normal"> {te('perPerson')}</span>
            </p>
            <div className="text-sarat-black-600 flex flex-col gap-1 text-sm">
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
              copy={bookingCopy}
            />
          </div>
        </aside>
      </div>
    </article>
  );
}
