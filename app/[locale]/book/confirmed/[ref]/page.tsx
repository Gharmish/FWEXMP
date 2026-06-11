import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Clock, MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getExperienceBySlug } from '@/features/experiences/queries';
import {
  getBookingByReferenceForViewer,
  getHostContactPhoneForBooking,
} from '@/features/bookings/queries';
import { whatsappLink } from '@/lib/whatsapp';
import { PrintButton } from '@/components/ui/print-button';
import { ReportProblemForm } from '@/features/disputes/components/report-problem-form';
import { hasOpenDisputeForBooking } from '@/features/disputes/queries';
import { CancelBookingButton } from '@/features/bookings/components/cancel-booking-button';
import { cancelEligibility, freeCancellationDeadline } from '@/features/bookings/lib/cancellation';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/features/admin/settings/queries';
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
  const booking = await getBookingByReferenceForViewer(ref);
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

  // A cancelled/refunded booking owns the whole header — the page reads
  // as the cancellation record, not a stale "request received". Declined
  // and expired requests likewise own it (nothing was ever charged in
  // the pay-after-approval model).
  const isCancelled = booking?.status === 'cancelled' || booking?.status === 'refunded';
  const isDeclined = booking?.status === 'declined';
  const isExpired = booking?.status === 'expired';
  // An approved request inside its payment window: confirmed by the host
  // but unpaid — the page's job is to get the guest to the payment step.
  const isAwaitingPayment =
    booking?.status === 'confirmed' &&
    booking.paymentStatus === 'unpaid' &&
    booking.approvedAt !== null &&
    booking.paymentDeadline !== null &&
    !isFailed;

  const HeaderIcon =
    isCancelled || isFailed || isDeclined
      ? CircleAlert
      : isPending || isExpired || isAwaitingPayment
        ? Clock
        : CheckCircle2;
  const headerIconClassName = cn(
    'size-7 shrink-0',
    isCancelled
      ? 'text-rijal-clay'
      : isFailed || isDeclined
        ? 'text-al-qatt-red'
        : isExpired
          ? 'text-sarat-black-600'
          : isAwaitingPayment
            ? 'text-pending'
            : isPending
              ? 'text-sarat-black-600'
              : isConfirmed
                ? 'text-juniper-green'
                : 'text-pending',
  );
  const headerEyebrowClassName = cn(
    eyebrowBase,
    isCancelled
      ? 'text-rijal-clay'
      : isFailed || isDeclined
        ? 'text-al-qatt-red-800'
        : isExpired
          ? 'text-sarat-black-600'
          : isAwaitingPayment
            ? 'text-pending'
            : isPending
              ? 'text-sarat-black-600'
              : isConfirmed
                ? 'text-juniper-green-800'
                : 'text-pending',
  );
  const headerEyebrow = isCancelled
    ? t('cancelledEyebrow')
    : isDeclined
      ? t('declinedEyebrow')
      : isExpired
        ? t('expiredEyebrow')
        : isFailed
          ? t('paymentFailedEyebrow')
          : isPending
            ? t('paymentPendingEyebrow')
            : isAwaitingPayment
              ? t('approvedEyebrow')
              : isConfirmed
                ? t('eyebrowConfirmed')
                : t('eyebrow');
  const headerTitle = isCancelled
    ? t('cancelledTitle')
    : isDeclined
      ? t('declinedTitle')
      : isExpired
        ? t('expiredTitle')
        : isFailed
          ? t('paymentFailedTitle')
          : isPending
            ? t('paymentPendingTitle')
            : isAwaitingPayment
              ? t('approvedTitle')
              : isConfirmed
                ? t('titleConfirmed')
                : t('title');
  const headerDescription = isCancelled
    ? booking?.status === 'refunded'
      ? t('cancelledDescriptionRefunded')
      : t('cancelledDescription')
    : isDeclined
      ? t('declinedDescription')
      : isExpired
        ? t('expiredDescription')
        : isFailed
          ? t('paymentFailedDescription')
          : isPending
            ? t('paymentPendingDescription')
            : isAwaitingPayment && booking.paymentDeadline
              ? t('approvedDescription', {
                  deadline: formatDate(new Date(booking.paymentDeadline), loc),
                })
              : !booking
                ? t('descriptionPreview')
                : isConfirmed
                  ? t('descriptionConfirmed')
                  : t('descriptionStored');
  // Plain pending request: tell the guest exactly when the host's window
  // closes (the distinct amber "pending host approval" state).
  const respondByNote =
    booking?.status === 'pending' && booking.approvalDeadline
      ? t('respondBy', { date: formatDate(new Date(booking.approvalDeadline), loc) })
      : null;

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
    // Prices are VAT-inclusive — the receipt discloses the portion.
    detailRows.push({
      label: t('vatIncludedLabel', { pct: vatRatePercent() }),
      value: <Price amount={vatPortionSar(booking.totalAmountSar)} locale={loc} />,
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

  // "Report a problem" swaps to a we're-on-it note while a dispute is open.
  const openDispute = booking ? await hasOpenDisputeForBooking(ref) : false;

  // WhatsApp line to the host — only once the host has accepted (the
  // query itself enforces confirmed/completed and returns null otherwise).
  const hostPhone =
    booking && (booking.status === 'confirmed' || booking.status === 'completed')
      ? await getHostContactPhoneForBooking(ref)
      : null;
  const hostWhatsapp = hostPhone
    ? whatsappLink(hostPhone, t('whatsapp.prefill', { reference: ref }))
    : null;

  // Guest cancellation. Computed server-side so the page shows the true
  // consequence (full refund vs forfeited) before the guest commits.
  let cancelView: { refund: 'none_needed' | 'full' | 'forfeited'; deadline: Date } | null = null;
  if (booking) {
    const { cancellationWindowHours } = await getPlatformSettings();
    const eligibility = cancelEligibility({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      dateStr: booking.date,
      startTime: booking.startTime,
      windowHours: cancellationWindowHours,
      now: new Date(),
    });
    if (eligibility.canCancel) {
      cancelView = {
        refund: eligibility.refund,
        deadline: freeCancellationDeadline(
          booking.date,
          booking.startTime,
          cancellationWindowHours,
        ),
      };
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
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {headerTitle}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
          {headerDescription}
        </p>
        {respondByNote && <p className="text-pending text-base font-medium">{respondByNote}</p>}
        {isAwaitingPayment && (
          <Link
            href={`/book/${ref}/pay${experienceSlug ? `?slug=${encodeURIComponent(experienceSlug)}` : ''}`}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'self-start')}
          >
            {t('payNow')}
          </Link>
        )}
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

        {/* The page doubles as the e-ticket — print it / save as PDF. */}
        {booking && !isFailed && !isCancelled && !isDeclined && !isExpired && (
          <div className="mt-2">
            <PrintButton label={t('printTicket')} />
          </div>
        )}
      </section>

      {/* The success "what happens next" steps only make sense once the
          booking is actually settled — suppress them while a payment failed
          or is still processing. */}
      {!isFailed &&
        !isPending &&
        !isCancelled &&
        !isDeclined &&
        !isExpired &&
        !isAwaitingPayment && (
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

      {/* Report a problem — quiet disclosure, any real booking. */}
      {booking && (
        <section className="mt-8 print:hidden">
          {openDispute ? (
            <p className="text-sarat-black-600 max-w-xl text-sm leading-relaxed">
              {t('dispute.openNote')}
            </p>
          ) : (
            <ReportProblemForm
              reference={ref}
              locale={loc}
              copy={{
                summary: t('dispute.summary'),
                label: t('dispute.label'),
                placeholder: t('dispute.placeholder'),
                submit: t('dispute.submit'),
                pending: t('dispute.pending'),
                success: t('dispute.success'),
                errors: {
                  no_db: t('dispute.errors.noDb'),
                  not_found: t('dispute.errors.notFound'),
                  already_open: t('dispute.errors.alreadyOpen'),
                  validation: t('dispute.errors.validation'),
                  server: t('dispute.errors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {/* Host contact — WhatsApp deep link once the booking is accepted. */}
      {hostWhatsapp && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('whatsapp.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {t('whatsapp.description')}
          </p>
          <a
            href={hostWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'md' }),
              'inline-flex items-center gap-2 self-start',
            )}
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {t('whatsapp.cta')}
          </a>
        </section>
      )}

      {/* Cancellation — only while the booking can still be cancelled. */}
      {cancelView && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('cancel.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {cancelView.refund === 'none_needed'
              ? t('cancel.policyUnpaid')
              : cancelView.refund === 'full'
                ? t('cancel.policyRefundable', {
                    deadline: formatDate(cancelView.deadline, loc),
                  })
                : t('cancel.policyForfeited')}
          </p>
          <CancelBookingButton
            reference={ref}
            locale={loc}
            copy={{
              label: t('cancel.label'),
              pending: t('cancel.pending'),
              confirm:
                cancelView.refund === 'forfeited'
                  ? t('cancel.confirmForfeited')
                  : t('cancel.confirm'),
              done: {
                none: t('cancel.doneUnpaid'),
                refunded: t('cancel.doneRefunded'),
                refund_pending: t('cancel.doneRefundPending'),
                forfeited: t('cancel.doneForfeited'),
              },
              errors: {
                forbidden: t('cancel.errors.forbidden'),
                no_db: t('cancel.errors.noDb'),
                not_found: t('cancel.errors.notFound'),
                wrong_state: t('cancel.errors.wrongState'),
                already_started: t('cancel.errors.alreadyStarted'),
                validation: t('cancel.errors.validation'),
                server: t('cancel.errors.server'),
              },
            }}
          />
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3 print:hidden">
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
