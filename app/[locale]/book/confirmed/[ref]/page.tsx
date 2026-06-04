import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Clock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { getBookingByReference } from '@/features/bookings/queries';
import { PendingPaymentRefresh } from '@/features/payments/components/pending-payment-refresh';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { Pop } from '@/components/ui/motion';

/** UUID v4 shape — the only thing we accept as a public reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HyperPay card-scheme codes → display names. Proper nouns, not translated
 * (mada is stylised lowercase per Saudi Payments brand guidance).
 */
const BRAND_NAMES: Record<string, string> = {
  MADA: 'mada',
  VISA: 'Visa',
  MASTER: 'Mastercard',
};

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
  // Instant bookings land here already `confirmed`; request bookings are
  // `pending` until the operator confirms. Drive the copy off that.
  const isConfirmed = booking?.status === 'confirmed';
  const title = experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? loc === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  // Payment outcome view. The `/pay/return` route appends `?payment=<outcome>`
  // and settlement has already written the authoritative `paymentStatus`, so
  // the DB wins and the query param is only a fallback (it also covers the
  // `error` case, where the booking row was left untouched). A `null` view is
  // the request-to-book / preview path that never involved online payment — its
  // copy is unchanged.
  const paymentHint = asString(sp.payment);
  const paymentView: 'paid' | 'failed' | 'pending' | null =
    booking?.paymentStatus === 'paid' || paymentHint === 'success'
      ? 'paid'
      : booking?.paymentStatus === 'failed' || paymentHint === 'rejected' || paymentHint === 'error'
        ? 'failed'
        : booking?.paymentStatus === 'processing' || paymentHint === 'pending'
          ? 'pending'
          : null;
  const isFailed = paymentView === 'failed';
  const isPending = paymentView === 'pending';

  // The eyebrow's tracking/case is shared across states; only colour shifts.
  const eyebrowBase = cn('text-[11px]', loc === 'en' && 'tracking-[0.2em] uppercase');
  // The reference label keeps the calm juniper treatment in every state.
  const eyebrowClassName = cn(eyebrowBase, 'text-juniper-green-800');

  const HeaderIcon = isFailed ? CircleAlert : isPending ? Clock : CheckCircle2;
  const headerIconClassName = cn(
    'size-7 shrink-0',
    isFailed ? 'text-al-qatt-red' : isPending ? 'text-sarat-black-600' : 'text-juniper-green',
  );
  const headerEyebrowClassName = cn(
    eyebrowBase,
    isFailed
      ? 'text-al-qatt-red-800'
      : isPending
        ? 'text-sarat-black-600'
        : 'text-juniper-green-800',
  );
  const headerEyebrow = isFailed
    ? t('paymentFailedEyebrow')
    : isPending
      ? t('paymentPendingEyebrow')
      : isConfirmed
        ? t('eyebrowConfirmed')
        : t('eyebrow');
  const headerTitle = isFailed
    ? t('paymentFailedTitle')
    : isPending
      ? t('paymentPendingTitle')
      : isConfirmed
        ? t('titleConfirmed')
        : t('title');
  const headerDescription = isFailed
    ? t('paymentFailedDescription')
    : isPending
      ? t('paymentPendingDescription')
      : !booking
        ? t('descriptionPreview')
        : isConfirmed
          ? t('descriptionConfirmed')
          : t('descriptionStored');

  const detailRows: Array<{ label: string; value: ReactNode }> = [];
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
      label: paymentView === 'paid' ? t('totalPaidLabel') : t('totalLabel'),
      value: <Price amount={booking.totalAmountSar} locale={loc} />,
    });
    // Once settled, show it as a receipt line — "Paid · mada" — so the page
    // reads as proof of payment, not just a request acknowledgement.
    if (paymentView === 'paid') {
      const brand = booking.paymentBrand ? BRAND_NAMES[booking.paymentBrand] : undefined;
      detailRows.push({
        label: t('paymentLabel'),
        value: brand ? `${t('paid')} · ${brand}` : t('paid'),
      });
    }
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-20">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Pop>
            <HeaderIcon className={headerIconClassName} aria-hidden />
          </Pop>
          <p className={headerEyebrowClassName}>{headerEyebrow}</p>
        </div>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {headerTitle}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
          {headerDescription}
        </p>
        {isPending && <PendingPaymentRefresh label={t('paymentChecking')} />}
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
              <div key={row.label} className="flex flex-col gap-1">
                <dt className="text-sarat-black-600 text-sm">{row.label}</dt>
                <dd className="text-base font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* The success "what happens next" steps only make sense once the
          booking is actually settled — suppress them while a payment failed
          or is still processing. */}
      {!isFailed && !isPending && (
        <section className="mt-10 flex flex-col gap-3">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('nextStepsHeading')}
          </h2>
          <ol className="text-sarat-black-600 flex flex-col gap-2 text-base">
            <li>{isConfirmed ? t('nextStepConfirmed1') : t('nextStep1')}</li>
            <li>{isConfirmed ? t('nextStepConfirmed2') : t('nextStep2')}</li>
            <li>{isConfirmed ? t('nextStepConfirmed3') : t('nextStep3')}</li>
          </ol>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {isFailed ? (
          <>
            <Link
              href={`/book/${ref}/pay${experienceSlug ? `?slug=${encodeURIComponent(experienceSlug)}` : ''}`}
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
            >
              {t('tryPaymentAgain')}
            </Link>
            {experienceSlug && (
              <Link
                href={`/experiences/${experienceSlug}`}
                className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
              >
                {t('backToExperience')}
              </Link>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </article>
  );
}
