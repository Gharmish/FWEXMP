import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatInteger, formatSAR } from '@/lib/format';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { getBookingByReference } from '@/features/bookings/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

/** UUID v4 shape — the only thing we accept as a public reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageParams {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'ar' ? 'تم استلام طلبك' : 'Booking request received';
  return {
    title,
    // Confirmation URLs are private to the requester; tell crawlers to skip.
    robots: { index: false, follow: false },
  };
}

function asString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingConfirmedPage({ params, searchParams }: PageParams) {
  const { locale, ref } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  if (!UUID_RE.test(ref)) notFound();

  const sp = await searchParams;
  const slugFromQuery = asString(sp.slug);

  // Prefer the DB-backed booking when available; fall back to the slug
  // we passed through the redirect (preview / not-yet-found path).
  const booking = await getBookingByReference(ref);
  const experienceSlug = booking?.experienceSlug ?? slugFromQuery;
  const experience = experienceSlug ? await getExperienceBySlug(experienceSlug) : undefined;

  const t = await getTranslations('bookingConfirmed');
  const title = experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? loc === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const eyebrowClassName = cn(
    'text-juniper-green-800 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const detailRows: Array<{ label: string; value: string }> = [];
  if (title) detailRows.push({ label: t('experienceLabel'), value: title });
  if (placeName) detailRows.push({ label: t('placeLabel'), value: placeName });
  if (booking) {
    detailRows.push({
      label: t('dateLabel'),
      value: formatDate(new Date(`${booking.date}T${booking.startTime}:00`), loc),
    });
    detailRows.push({
      label: t('partyLabel'),
      value: formatInteger(booking.partySize, loc),
    });
    detailRows.push({
      label: t('totalLabel'),
      value: formatSAR(booking.totalAmountSar, loc),
    });
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-20">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-juniper-green size-7 shrink-0" aria-hidden />
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
        </div>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
          {booking ? t('descriptionStored') : t('descriptionPreview')}
        </p>
      </header>

      <section
        className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-4 [border-width:0.5px] p-6"
        aria-labelledby="booking-reference-heading"
      >
        <p id="booking-reference-heading" className={eyebrowClassName}>
          {t('referenceLabel')}
        </p>
        <p className="font-display text-2xl font-medium tracking-[-0.025em] break-all">{ref}</p>

        {detailRows.length > 0 && (
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {detailRows.map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5">
                <dt className="text-sarat-black-600 text-sm">{row.label}</dt>
                <dd className="text-base font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="mt-10 flex flex-col gap-3">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
          {t('nextStepsHeading')}
        </h2>
        <ol className="text-sarat-black-600 flex flex-col gap-2 text-base">
          <li>{t('nextStep1')}</li>
          <li>{t('nextStep2')}</li>
          <li>{t('nextStep3')}</li>
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        {experienceSlug && (
          <Link
            href={`/experiences/${experienceSlug}`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
          >
            {t('backToExperience')}
          </Link>
        )}
        <Link
          href="/experiences"
          className={cn(
            buttonVariants({ variant: 'primary', size: 'lg' }),
            'inline-flex items-center gap-2',
          )}
        >
          {t('keepExploring')}
          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
