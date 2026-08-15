import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock,
  MapPin,
  MessageCircle,
  Star,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getExperienceBySlug } from '@/features/experiences/queries';
import {
  getBookingViewForViewer,
  getHostContactPhoneForBooking,
} from '@/features/bookings/queries';
import { BookingAccessNotice } from '@/features/bookings/components/booking-access-notice';
import { whatsappLink } from '@/lib/whatsapp';
import { SITE_URL } from '@/lib/site';
import { supportWhatsappE164 } from '@/lib/env';
import { PrintButton } from '@/components/ui/print-button';
import { ShareButton } from '@/components/ui/share-button';
import { RelatedExperiences } from '@/features/experiences/components/related-experiences';
import { ensureReferralCode } from '@/lib/marketing/referral';
import { GharmishLogo } from '@/components/layout/gharmish-logo';
import { ReportProblemForm } from '@/features/disputes/components/report-problem-form';
import { ReviewForm } from '@/features/reviews/components/review-form';
import { getReviewForBooking } from '@/features/reviews/queries';
import { hasOpenDisputeForBooking } from '@/features/disputes/queries';
import { CancelBookingButton } from '@/features/bookings/components/cancel-booking-button';
import { MeetingPointMap } from '@/features/experiences/components/meeting-point-map';
import { AddToCalendar } from '@/features/bookings/components/add-to-calendar';
import {
  calendarEventDescription,
  googleCalendarUrl,
  googleMapsLink,
} from '@/features/bookings/lib/calendar-links';
import { startInstant } from '@/features/bookings/lib/cancellation';
import {
  BOOKING_LINK_TOKEN_PARAM,
  bookingManageUrl,
} from '@/features/bookings/lib/link-token';
import { VerifiedBadge } from '@/features/hosts/components/verified-badge';
import { RescheduleBooking } from '@/features/bookings/components/reschedule-booking';
import { RefundToCardButton } from '@/features/wallet/components/refund-to-card-button';
import { getSessionGuestId } from '@/features/wallet/queries';
import { bookingOptions } from '@/features/bookings/lib/policy';
import {
  addDays,
  bookableDates,
  isHoldExpired,
  nowMinutesInRiyadh,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { getScheduleDataBySlug } from '@/features/availability/queries';
import type { BookableOption } from '@/features/bookings/types';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { PendingPaymentRefresh } from '@/features/payments/components/pending-payment-refresh';
import { CheckoutProgress } from '@/features/payments/components/checkout-progress';
import { PurchaseConversion } from '@/features/bookings/components/purchase-conversion';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { Draw, Pop, Stagger, StaggerItem } from '@/components/ui/motion';

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

export async function generateMetadata({ params, searchParams }: PageParams): Promise<Metadata> {
  const { locale, ref } = await params;
  const t = await getTranslations({ locale, namespace: 'bookingConfirmed' });
  // A withheld booking renders the sign-in state, so the tab must not
  // announce "Booking request received". The lookup is React-cached on
  // (ref, token) — the render below reuses this exact result, no second
  // query, so the token has to be passed here too or the two calls
  // disagree and each runs its own query.
  const token = asString((await searchParams)[BOOKING_LINK_TOKEN_PARAM]);
  const restricted =
    UUID_RE.test(ref) && (await getBookingViewForViewer(ref, token)).state === 'forbidden';
  const title = restricted ? t('restricted.title') : t('meta.title');
  const tSite = await getTranslations({ locale, namespace: 'siteMeta' });
  return {
    title,
    // Confirmation URLs are private to the requester; tell crawlers to skip.
    robots: { index: false, follow: false },
    // Booking links are delivered over WhatsApp, so the link preview matters:
    // without an explicit openGraph block the shallow metadata merge shows
    // the root layout's bare brand og:title. Deliberately generic copy only —
    // no booking details may leak into a preview (the crawler holds the
    // tokenized URL). Declaring the block replaces the parent's resolved
    // openGraph wholesale — including the [locale]-level opengraph-image
    // file convention — so the brand card must be re-attached explicitly.
    openGraph: {
      title,
      description: tSite('description'),
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: tSite('description'),
      images: [`${SITE_URL}/${locale}/opengraph-image`],
    },
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
  // Signed proof of ownership from the link we sent (email / WhatsApp),
  // for the browser that holds no last-booking cookie. Read-only: the
  // cancel and reschedule actions below re-check ownership without it.
  const token = asString(sp[BOOKING_LINK_TOKEN_PARAM]);
  const tokenQuery = token ? `?${BOOKING_LINK_TOKEN_PARAM}=${encodeURIComponent(token)}` : '';

  // Prefer the DB-backed booking when available; fall back to the slug
  // we passed through the redirect (preview path).
  //
  // The three withheld states are NOT the same page (2026-08-08):
  //   - `forbidden` — the booking is real but this browser/account can't
  //     prove it owns it. Its own honest state; the old code showed the
  //     developer preview copy ("the request was not stored"), which a
  //     guest reads as "my paid booking is gone". Access itself is
  //     unchanged — the reference still proves nothing on its own.
  //   - `not_found` — no such booking: a plain 404, like a malformed ref.
  //   - `no_db` — genuine preview environment; the ONLY preview copy path.
  const view = await getBookingViewForViewer(ref, token);
  if (view.state === 'not_found') notFound();
  if (view.state === 'forbidden') return <BookingAccessNotice locale={loc} />;
  const booking = view.state === 'ok' ? view.booking : undefined;
  const experienceSlug = booking?.experienceSlug ?? slugFromQuery;
  const experience = experienceSlug ? await getExperienceBySlug(experienceSlug) : undefined;

  const t = await getTranslations('bookingConfirmed');
  const tShare = await getTranslations('share');
  const tSteps = await getTranslations('payment.steps');
  // Meeting-point copy is shared with the experience detail page.
  const tExp = await getTranslations('experienceDetail');
  // Instant bookings land here already `confirmed`; request bookings are
  // `pending` until the operator confirms. Drive the copy off that.
  const isConfirmed = booking?.status === 'confirmed';
  const title = experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? loc === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;
  // "{city}, {region}" line for the meeting-point block — same composition
  // as the experience detail page, so both surfaces read identically.
  const locationLine = experience
    ? loc === 'ar'
      ? `${toArabicText(experience.city)}، ${toArabicText(experience.region)}`
      : `${experience.city}, ${experience.region}`
    : null;

  // Payment outcome view. The `/pay/return` route appends `?payment=<outcome>`
  // and settlement has already written the authoritative `paymentStatus`, so
  // the DB wins and the query param is only a fallback. A `null` view is
  // the request-to-book / preview path that never involved online payment — its
  // copy is unchanged.
  //
  // Only `rejected` is a DETERMINATE decline. `error` (settle could not
  // reach a verdict — the row stays `processing`) reads as pending, not
  // failed: the failed copy states "your card wasn't charged" and offers
  // a retry, and on an indeterminate outcome we know neither. The return
  // route already maps that outcome to `pending`; this keeps a stale or
  // hand-edited `?payment=error` from asserting it anyway.
  const paymentHint = asString(sp.payment);
  const paymentView: 'paid' | 'failed' | 'pending' | null =
    booking?.paymentStatus === 'paid' || paymentHint === 'success'
      ? 'paid'
      : booking?.paymentStatus === 'failed' || paymentHint === 'rejected'
        ? 'failed'
        : booking?.paymentStatus === 'processing' ||
            paymentHint === 'pending' ||
            paymentHint === 'error'
          ? 'pending'
          : null;

  // An online-payment hold whose window has passed without settling.
  // The cron will release it (→ cancelled) on its next run; until then
  // the page must already tell the truth: the spot is no longer held,
  // nothing was charged, and retrying payment is refused. Takes
  // precedence over the failed state — "try payment again" would only
  // bounce off `createCheckout`'s expiry guard.
  const isHoldLapsed = Boolean(
    booking &&
    booking.status === 'confirmed' &&
    (booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed') &&
    isHoldExpired(booking.paymentDeadline ? new Date(booking.paymentDeadline) : null, new Date()),
  );
  const isFailed = paymentView === 'failed' && !isHoldLapsed;
  const isPending = paymentView === 'pending';

  /** Money-relevant deadlines carry a time-of-day, so render it. */
  const formatDeadline = (d: Date): string =>
    loc === 'ar'
      ? `${formatDate(d, loc)}، ${formatTime(d, loc)}`
      : `${formatDate(d, loc)}, ${formatTime(d, loc)}`;

  // The eyebrow's tracking/case is shared across states; only colour shifts.
  const eyebrowBase = cn('font-medium text-[11px]', loc === 'en' && 'tracking-[0.2em] uppercase');
  // The reference label keeps the calm juniper treatment in every state.
  const eyebrowClassName = cn(eyebrowBase, 'text-juniper-green-800');

  // A cancelled/refunded booking owns the whole header — the page reads
  // as the cancellation record, not a stale "request received". Declined
  // and expired requests likewise own it (nothing was ever charged in
  // the pay-after-approval model).
  const isCancelled = booking?.status === 'cancelled' || booking?.status === 'refunded';
  // Emergency-cancelled with the payment returned as Gharmish Credit —
  // the page adds the guest's choice: spend the credit, or move the
  // card-charged share back to the original payment method. The to-card
  // action is wallet-scoped, so it renders only for the wallet's OWNER
  // (signed-in account), never for a cookie-only viewer.
  const isWalletRefunded = booking?.status === 'refunded' && booking.refundMethod === 'wallet';
  const walletOwner =
    isWalletRefunded && booking ? (await getSessionGuestId()) === booking.guestId : false;
  const walletCreditSar = booking ? booking.totalAmountSar + booking.walletAppliedSar : 0;
  // Referral share tag for the invite-friends button below — minted
  // lazily on the guest's first visit here; null (mint failure / no
  // booking) degrades to the plain share URL.
  const referralCode = booking?.guestId ? await ensureReferralCode(booking.guestId) : null;
  const referralShareSuffix = referralCode ? `?ref=${referralCode}` : '';
  const isDeclined = booking?.status === 'declined';
  const isExpired = booking?.status === 'expired';
  // "Try payment again" is only honest while the pay page would accept
  // the booking. A cancelled/declined/expired row can carry a stale
  // failed payment (e.g. cancelled after a failed attempt) — the header
  // already lets those states win, but the footer CTA used bare
  // `isFailed` and rendered a retry button that just bounces off the
  // pay page's guards, straight back here.
  const canRetryPayment = isFailed && !isCancelled && !isDeclined && !isExpired;
  // Any confirmed-but-unpaid booking inside a live payment window —
  // an approved request *or* an instant booking whose guest left the
  // pay page. The page's job is to get them to the payment step; it
  // must never read as a finished ticket while money is still owed.
  // `!isPending` is load-bearing (2026-07-28 sixth audit). The
  // promo/credit settle race leaves the row `confirmed` + `unpaid` with
  // a live deadline while a REAL capture is sitting unmatched at the
  // gateway — so this was true at the same time as `isPending`, and the
  // page rendered "no need to pay again" directly above a working
  // "Pay now" button. `createCheckout` accepts that state, so a tap
  // minted a second checkout and charged the guest twice.
  const isAwaitingPayment =
    booking?.status === 'confirmed' &&
    booking.paymentStatus === 'unpaid' &&
    booking.paymentDeadline !== null &&
    !isHoldLapsed &&
    !isFailed &&
    !isPending;

  // Checkout stepper — only for bookings on the online-payment journey.
  // Paid lands on step 3 (all checked once the experience is completed);
  // a live/failed/processing payment sits on step 2. Broken-off states
  // (cancelled, declined, expired, lapsed hold) and plain request
  // acknowledgements get no stepper: there is no forward progress to
  // promise there.
  const checkoutStep =
    isCancelled || isDeclined || isExpired || isHoldLapsed
      ? null
      : paymentView === 'paid'
        ? booking?.status === 'completed'
          ? 3
          : 2
        : isAwaitingPayment || isFailed || isPending
          ? 1
          : null;

  const HeaderIcon =
    isCancelled || isFailed || isDeclined
      ? CircleAlert
      : isPending || isExpired || isAwaitingPayment || isHoldLapsed
        ? Clock
        : CheckCircle2;
  const headerIconClassName = cn(
    'size-7 shrink-0',
    isCancelled
      ? 'text-rijal-clay'
      : isFailed || isDeclined
        ? 'text-al-qatt-red'
        : isExpired || isHoldLapsed
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
        : isExpired || isHoldLapsed
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
        : isHoldLapsed
          ? t('holdLapsedEyebrow')
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
        : isHoldLapsed
          ? t('holdLapsedTitle')
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
    ? isWalletRefunded
      ? t('cancelledDescriptionWalletCredit', { amount: formatSAR(walletCreditSar, loc) })
      : booking?.status === 'refunded'
        ? t('cancelledDescriptionRefunded')
        : t('cancelledDescription')
    : isDeclined
      ? t('declinedDescription')
      : isExpired
        ? t('expiredDescription')
        : isHoldLapsed
          ? t('holdLapsedDescription')
          : isFailed
            ? t('paymentFailedDescription')
            : isPending
              ? t('paymentPendingDescription')
              : isAwaitingPayment && booking.paymentDeadline
                ? t('approvedDescription', {
                    deadline: formatDeadline(new Date(booking.paymentDeadline)),
                  })
                : // No booking here means exactly one thing now: no DB at
                  // all. Unauthorized viewers returned above, unknown
                  // references 404'd — neither reaches this preview copy.
                  !booking
                  ? t('descriptionPreview')
                  : isConfirmed
                    ? t('descriptionConfirmed')
                    : t('descriptionStored');
  // Plain pending request: tell the guest exactly when the host's window
  // closes (the distinct amber "pending host approval" state).
  const respondByNote =
    booking?.status === 'pending' && booking.approvalDeadline
      ? t('respondBy', { date: formatDeadline(new Date(booking.approvalDeadline)) })
      : null;

  // Ticket layout splits what used to be one flat detail list: the
  // schedule facts (date / time / guests) render as prominent tiles, the
  // money lines as right-aligned receipt rows below a perforation-style
  // divider. The experience title + place become the card's own header.
  const factTiles: Array<{ label: string; value: ReactNode }> = [];
  const moneyRows: Array<{ label: string; value: ReactNode; emphasis?: boolean }> = [];
  if (booking) {
    // KSA-pinned instant (not a bare `new Date(date T time)`, which the
    // runtime reads in SERVER-local time — on a UTC host that shifted
    // every displayed start time +3h vs the emails' startInstant).
    const startsAt = startInstant(booking.date, booking.startTime);
    factTiles.push({
      label: t('dateLabel'),
      value: formatDate(startsAt, loc),
    });
    factTiles.push({
      label: t('timeLabel'),
      value: formatTime(startsAt, loc),
    });
    factTiles.push({
      label: t('partyLabel'),
      value: formatInteger(booking.partySize, loc),
    });
    // Promo: subtotal (pre-discount) + a discount line above the charged
    // total. `totalAmountSar` is always the post-discount amount.
    if (booking.discountSar > 0) {
      moneyRows.push({
        label: t('subtotalLabel'),
        value: <Price amount={booking.totalAmountSar + booking.discountSar} locale={loc} />,
      });
      moneyRows.push({
        label: booking.promoCode
          ? t('discountLabel', { code: booking.promoCode })
          : t('discountLabelGeneric'),
        value: (
          <span className="text-juniper-green-800">
            −<Price amount={booking.discountSar} locale={loc} />
          </span>
        ),
      });
    }
    // Gharmish Credit redeemed at checkout — its own line above the
    // charged total, mirroring the promo treatment.
    if (booking.walletAppliedSar > 0) {
      moneyRows.push({
        label: t('walletAppliedLabel'),
        value: (
          <span className="text-juniper-green-800">
            −<Price amount={booking.walletAppliedSar} locale={loc} />
          </span>
        ),
      });
    }
    moneyRows.push({
      label: paymentView === 'paid' ? t('totalPaidLabel') : t('totalLabel'),
      value: <Price amount={booking.totalAmountSar} locale={loc} />,
      emphasis: true,
    });
    // Prices are VAT-inclusive. The VAT line renders ONLY from the
    // per-booking snapshot stamped at settlement — a paid booking from
    // before the platform registered for VAT stays VAT-silent forever,
    // and unpaid bookings disclose nothing until the money moves.
    if (booking.vatRateBps) {
      moneyRows.push({
        label: t('vatIncludedLabel', { pct: vatRatePercent(booking.vatRateBps) }),
        value: (
          <Price amount={vatPortionSar(booking.totalAmountSar, booking.vatRateBps)} locale={loc} />
        ),
      });
    }
    // Once settled, show it as a receipt line — "Paid · mada" — so the page
    // reads as proof of payment, not just a request acknowledgement.
    if (paymentView === 'paid') {
      const brand = booking.paymentBrand ? BRAND_NAMES[booking.paymentBrand] : undefined;
      moneyRows.push({
        label: t('paymentLabel'),
        value: brand ? `${t('paid')} · ${brand}` : t('paid'),
      });
    }
  }

  // "Report a problem" swaps to a we're-on-it note while a dispute is open.
  const openDispute = booking ? await hasOpenDisputeForBooking(ref) : false;

  // Review entry for ANY completed booking — this page is reachable from
  // the booking history, so reviews are no longer limited to the /me
  // "last booking" card. Copy comes from the same `me.review` namespace.
  const bookingReview =
    booking?.status === 'completed' ? await getReviewForBooking(booking.id) : null;
  const reviewEditable = bookingReview
    ? new Date(bookingReview.editableUntil).getTime() > new Date().getTime()
    : false;
  const tMe = booking?.status === 'completed' ? await getTranslations('me') : null;
  const reviewCopy = tMe
    ? {
        ratingLabel: tMe('review.ratingLabel'),
        ratingValueLabels: [1, 2, 3, 4, 5].map((n) => tMe('review.ratingValue', { rating: n })) as [
          string,
          string,
          string,
          string,
          string,
        ],
        ratingRequired: tMe('review.ratingRequired'),
        commentLabel: tMe('review.commentLabel'),
        commentOptional: tMe('review.commentOptional'),
        commentPlaceholder: tMe('review.commentPlaceholder'),
        errors: {
          no_db: tMe('review.errors.noDb'),
          not_found: tMe('review.errors.notFound'),
          wrong_state: tMe('review.errors.wrongState'),
          already_reviewed: tMe('review.errors.alreadyReviewed'),
          forbidden: tMe('review.errors.forbidden'),
          expired: tMe('review.errors.expired'),
          throttled: tMe('review.errors.throttled'),
          validation: tMe('review.errors.validation'),
          server: tMe('review.errors.server'),
        },
      }
    : null;

  // WhatsApp line to the host — only once the host has accepted (the
  // query itself enforces confirmed/completed and returns null otherwise).
  const hostPhone =
    booking && (booking.status === 'confirmed' || booking.status === 'completed')
      ? await getHostContactPhoneForBooking(ref)
      : null;
  const hostWhatsapp = hostPhone
    ? whatsappLink(hostPhone, t('whatsapp.prefill', { reference: booking?.referenceCode ?? ref }))
    : null;

  // Gharmish support over WhatsApp — every real booking, every state.
  // Pending requests, payment trouble, and cancellations are exactly
  // when guests reach for support, and the host line (above) only
  // exists once the host has accepted.
  const supportPhone = booking ? supportWhatsappE164() : null;
  const supportWhatsapp = supportPhone
    ? whatsappLink(
        supportPhone,
        t('supportWhatsapp.prefill', { reference: booking?.referenceCode ?? ref }),
      )
    : null;

  // Guest cancellation & rescheduling, from the booking's own policy
  // snapshot. Computed server-side so the page shows the true consequence
  // (full / partial / forfeited refund) before the guest commits — and so
  // an option is only ever rendered when the server action (which re-runs
  // the same `bookingOptions`) would also allow it.
  const options = booking
    ? bookingOptions({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        dateStr: booking.date,
        startTime: booking.startTime,
        createdAt: new Date(booking.createdAt),
        // Full paid base (card + redeemed credit) — matches the server
        // action, so the quoted refund equals what actually comes back.
        totalAmountSar: booking.totalAmountSar + booking.walletAppliedSar,
        snapshot: booking.policy,
        rescheduleCount: booking.rescheduleCount,
        rescheduledFromDate: booking.rescheduledFromDate,
        now: new Date(),
      })
    : null;
  const cancelView = options && options.cancel.allowed ? options.cancel : null;
  const rescheduleView = options && options.reschedule.allowed ? options.reschedule : null;

  // Target dates for a reschedule — the same bookable-days computation the
  // experience page feeds its calendar, minus the booking's current date
  // and any day without room for this party. Only built when the option
  // will actually render.
  let rescheduleDates: BookableOption[] = [];
  if (booking && rescheduleView && !isHoldLapsed) {
    const RESCHEDULE_HORIZON_DAYS = 60;
    const todayRiyadh = todayInRiyadh();
    const [schedule, tb] = await Promise.all([
      getScheduleDataBySlug(
        booking.experienceSlug,
        todayRiyadh,
        addDays(todayRiyadh, RESCHEDULE_HORIZON_DAYS),
      ),
      getTranslations('bookingRequest'),
    ]);
    if (schedule) {
      rescheduleDates = bookableDates({
        fromStr: todayRiyadh,
        days: RESCHEDULE_HORIZON_DAYS + 1,
        availabilityWeekdays: schedule.availabilityWeekdays,
        blackoutDates: schedule.blackoutDates,
        stopSellDates: schedule.stopSellDates,
        maxGroupSize: schedule.maxGroupSize,
        bookedByDate: schedule.bookedByDate,
        startTime: schedule.startTime,
        nowMinutes: nowMinutesInRiyadh(),
        cutoffMinutes: schedule.bookingCutoffHours * 60,
      })
        .filter((d) => d.date !== booking.date && d.remaining >= booking.partySize)
        .map((d) => ({
          value: d.date,
          label: formatDate(new Date(`${d.date}T12:00:00Z`), loc, 'gregory', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }),
          remaining: d.remaining,
          spotsLabel: tb('spotsLeft', { count: d.remaining }),
        }));
    }
  }
  // The partial-step amount is deterministic from the snapshot, so the
  // confirm/done copy can quote it regardless of which refund state the
  // page happened to render in.
  const partialAmountSar = booking
    ? Math.floor(
        ((booking.totalAmountSar + booking.walletAppliedSar) * booking.policy.partialRefundBps) /
          10_000,
      )
    : 0;

  // "Add to calendar" — only an upcoming confirmed booking with nothing
  // owed belongs in a guest's calendar (the same settled gate as the
  // e-ticket row it renders in, narrowed to confirmed + future start).
  // Needs the live listing for duration/location; a retired listing
  // just drops the buttons.
  const calendarStart = booking ? startInstant(booking.date, booking.startTime) : null;
  const calendarGoogleUrl =
    booking &&
    experience &&
    calendarStart &&
    calendarStart.getTime() > new Date().getTime() &&
    booking.status === 'confirmed' &&
    (booking.paymentStatus === 'paid' || booking.paymentDeadline === null)
      ? googleCalendarUrl({
          start: calendarStart,
          durationMinutes: experience.durationMinutes,
          summary: title ?? booking.referenceCode ?? ref,
          location: placeName,
          description: calendarEventDescription({
            referenceLine: `${t('referenceLabel')}: ${booking.referenceCode ?? ref}`,
            // Tokened: this URL lives on inside a calendar event the
            // guest opens weeks later, often on another device.
            manageUrl: bookingManageUrl(loc, ref),
            mapUrl: googleMapsLink(experience.lat, experience.lng),
          }),
        })
      : null;

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-20">
      {/* Ad-platform purchase conversion — only for a DB-verified paid
          booking (the query-param hint alone never fires money events). */}
      {booking && booking.paymentStatus === 'paid' && (
        <PurchaseConversion
          reference={booking.referenceCode ?? ref}
          // GROSS paid value (card capture + redeemed credit) — what the
          // booking was worth to the platform, matching the server-side
          // TikTok event so the two dedupe into one conversion.
          amountSar={booking.totalAmountSar + booking.walletAppliedSar}
          experienceSlug={experienceSlug ?? undefined}
        />
      )}
      {/* Same stepper as the pay page, so the flow reads as one journey.
          Not on the e-ticket: progress chrome means nothing on paper. */}
      {checkoutStep !== null && (
        <CheckoutProgress
          steps={[tSteps('details'), tSteps('payment'), tSteps('confirmed')]}
          current={checkoutStep}
          label={tSteps('label')}
          locale={loc}
          className="mb-10 print:hidden"
        />
      )}
      {/* Print-only brand header: the site chrome is print-hidden, so the
          e-ticket carries its own wordmark. */}
      <div className="text-sarat-black mb-8 hidden print:block">
        <GharmishLogo className="h-7" />
      </div>
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
        {isPending && (
          <PendingPaymentRefresh
            label={t('paymentChecking')}
            stalledLabel={t('paymentStillChecking')}
            refreshLabel={t('paymentCheckAgain')}
          />
        )}
      </header>

      <section
        className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-4 [border-width:0.5px] p-6"
        aria-labelledby="booking-reference-heading"
      >
        <p id="booking-reference-heading" className={eyebrowClassName}>
          {t('referenceLabel')}
        </p>
        {/* Human reference (GH-XXXXXX); the UUID shows only on the no-DB
            preview path where no row (and so no code) exists. */}
        <p className="font-display text-2xl font-medium tracking-[0.04em] break-all" dir="ltr">
          {booking?.referenceCode ?? ref}
        </p>
        {/* Saffron hairline draws under the reference — a quiet flourish on
            the one number the guest will quote everywhere. */}
        <Draw axis="x" delay={0.15}>
          <span className="bg-saffron-gold block h-0.5 w-16 rounded-full" />
        </Draw>

        {/* What was booked — the ticket's own header. */}
        {title && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="font-display text-xl font-medium tracking-[-0.025em] text-balance">
              {title}
            </p>
            {placeName && (
              <p className="text-sarat-black-600 inline-flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {placeName}
              </p>
            )}
          </div>
        )}

        {/* When and for how many — the facts a guest re-checks, sized so
            they can be read at a glance on the day. */}
        {factTiles.length > 0 && (
          <>
            <span
              className="border-sarat-black/12 mt-1 block border-t border-dashed [border-top-width:0.5px]"
              aria-hidden
            />
            <Stagger>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {factTiles.map((row) => (
                  <StaggerItem key={row.label} className="flex flex-col gap-1">
                    <dt className={cn(eyebrowBase, 'text-sarat-black-600')}>{row.label}</dt>
                    <dd className="font-display text-lg font-medium tracking-[-0.01em]">
                      {row.value}
                    </dd>
                  </StaggerItem>
                ))}
              </dl>
            </Stagger>
          </>
        )}

        {/* The money, as receipt lines under the ticket's perforation. */}
        {moneyRows.length > 0 && (
          <>
            <span
              className="border-sarat-black/12 mt-1 block border-t border-dashed [border-top-width:0.5px]"
              aria-hidden
            />
            <dl className="flex flex-col gap-2">
              {moneyRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-6">
                  <dt
                    className={cn(
                      'text-sm',
                      row.emphasis ? 'text-sarat-black font-medium' : 'text-sarat-black-600',
                    )}
                  >
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      row.emphasis ? 'font-display text-lg font-medium' : 'text-sm font-medium',
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {/* The page doubles as the e-ticket — print it / save as PDF. Only
            once nothing is owed: paid, or a booking that never required
            online payment (request acknowledgements, payment-off mode).
            An unpaid hold must never print as a ticket. */}
        {booking &&
          !isFailed &&
          !isCancelled &&
          !isDeclined &&
          !isExpired &&
          !isAwaitingPayment &&
          !isHoldLapsed &&
          !isPending &&
          (booking.paymentStatus === 'paid' || booking.paymentDeadline === null) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PrintButton label={t('printTicket')} />
              {/* The keepable payment document (receipt / tax invoice) —
                  only exists once money actually moved. */}
              {booking.paidAt && (
                <Link
                  href={`/book/confirmed/${ref}/invoice${tokenQuery}`}
                  className={cn(
                    buttonVariants({ variant: 'secondary', size: 'md' }),
                    'print:hidden',
                  )}
                >
                  {t('viewInvoice')}
                </Link>
              )}
              {/* Upcoming confirmed bookings only — Google deep link plus
                  an .ics download for Apple Calendar / Outlook. */}
              {calendarGoogleUrl && (
                <AddToCalendar
                  googleUrl={calendarGoogleUrl}
                  icsHref={`/api/bookings/${ref}/calendar?locale=${loc}${
                    token ? `&${BOOKING_LINK_TOKEN_PARAM}=${encodeURIComponent(token)}` : ''
                  }`}
                  labels={{ google: t('calendar.google'), ics: t('calendar.ics') }}
                />
              )}
              {/* Invite friends — shares the PUBLIC experience page. The
                  booking URL carries the signed access token and must
                  never leave this guest's hands via a share sheet. The
                  guest's referral code rides along as `?ref=` — captured
                  first-touch on the friend's landing and rewarded (when
                  the platform reward is enabled) at their first paid
                  settlement. Minted lazily; null degrades to the plain
                  share URL. */}
              {experienceSlug && title && (
                <ShareButton
                  url={`${SITE_URL}/${loc}/experiences/${experienceSlug}${referralShareSuffix}`}
                  title={title}
                  contentType="experience"
                  analyticsId={experienceSlug}
                  label={tShare('dialogTitleExperience')}
                  variant="outline"
                />
              )}
            </div>
          )}
      </section>

      {/* Meeting point — the answer to "where do I actually go?", right on
          the booking page once the spot is truly held (confirmed AND
          nothing still owed). The map embed is screen-only; the printed
          ticket already carries the place name, and the calendar event +
          reminder emails carry the Google Maps link. */}
      {isConfirmed &&
        !isAwaitingPayment &&
        !isHoldLapsed &&
        !isPending &&
        !isFailed &&
        experience &&
        placeName &&
        locationLine && (
          <section className="mt-10 flex flex-col gap-3 print:hidden">
            <h2 className="font-display flex items-center gap-2.5 text-2xl font-medium tracking-[-0.025em]">
              <MapPin className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
              {tExp('meetingPoint.heading')}
            </h2>
            <MeetingPointMap
              lat={experience.lat}
              lng={experience.lng}
              placeName={placeName}
              location={locationLine}
            />
          </section>
        )}

      {/* Emergency-cancellation credit: the money already sits in the
          guest's wallet — this panel is where they choose what happens
          next. "Back to my card" only renders while the card-charged
          share is still reversible (it disappears once requested, when
          refundMethod flips to gateway). */}
      {isWalletRefunded && booking && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-4 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('walletCredit.heading')}
          </h2>
          <p className="text-sarat-black-600 text-base leading-relaxed">
            {t('walletCredit.description', { amount: formatSAR(walletCreditSar, loc) })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/experiences"
              className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
            >
              {t('walletCredit.browse')}
            </Link>
            {!walletOwner && (
              // Wallet actions are session-owned — tell a signed-out (or
              // cookie-only) viewer to sign in rather than look broken.
              <p className="text-sarat-black-600 text-sm">{t('walletCredit.signInHint')}</p>
            )}
            {walletOwner && booking.totalAmountSar > 0 && (
              <RefundToCardButton
                reference={ref}
                locale={loc}
                copy={{
                  label: t('walletCredit.toCard'),
                  pending: t('walletCredit.toCardPending'),
                  confirmTitle: t('walletCredit.confirmTitle'),
                  confirmDescription: t('walletCredit.confirmDescription', {
                    amount: formatSAR(booking.totalAmountSar, loc),
                  }),
                  doneRefunded: t('walletCredit.doneRefunded'),
                  doneRefundPending: t('walletCredit.doneRefundPending'),
                  errors: {
                    not_found: t('walletCredit.errors.notFound'),
                    not_eligible: t('walletCredit.errors.notEligible'),
                    insufficient_balance: t('walletCredit.errors.insufficientBalance'),
                    already_requested: t('walletCredit.errors.alreadyRequested'),
                    validation: t('walletCredit.errors.server'),
                    no_db: t('walletCredit.errors.server'),
                    server: t('walletCredit.errors.server'),
                  },
                }}
              />
            )}
          </div>
        </section>
      )}

      {/* The success "what happens next" steps only make sense once the
          booking is actually settled — suppress them while a payment failed
          or is still processing. */}
      {!isFailed &&
        !isPending &&
        !isCancelled &&
        !isDeclined &&
        !isExpired &&
        !isAwaitingPayment &&
        !isHoldLapsed && (
          <section className="mt-10 flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('nextStepsHeading')}
            </h2>
            <ol className="mt-1 flex flex-col gap-4">
              {[
                isConfirmed ? t('nextStepConfirmed1') : t('nextStep1'),
                isConfirmed ? t('nextStepConfirmed2') : t('nextStep2'),
                isConfirmed ? t('nextStepConfirmed3') : t('nextStep3'),
              ].map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  {/* Decorative order marker — the ol carries the semantics. */}
                  <span
                    className="border-sarat-black/12 bg-mist text-sarat-black-600 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium [border-width:0.5px]"
                    aria-hidden
                  >
                    {formatInteger(index + 1, loc)}
                  </span>
                  <span className="text-sarat-black-600 text-base leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

      {/* Review — every completed booking can be reviewed right here.
          `id="review"` is the review-invite deep link's anchor (email +
          WhatsApp CTAs land the guest directly on the composer). */}
      {booking?.status === 'completed' && tMe && reviewCopy && (
        <section
          id="review"
          className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-4 [border-width:0.5px] p-6 print:hidden"
        >
          {bookingReview && reviewEditable ? (
            <ReviewForm
              bookingReference={ref}
              locale={loc}
              mode="edit"
              initialRating={bookingReview.rating}
              initialText={(loc === 'ar' ? bookingReview.textAr : bookingReview.textEn) ?? ''}
              copy={{
                ...reviewCopy,
                heading: tMe('review.editHeading'),
                submit: tMe('review.update'),
                submitting: tMe('review.updating'),
              }}
            />
          ) : bookingReview ? (
            <div className="flex flex-col gap-3">
              <p className={eyebrowClassName}>{tMe('review.reviewedEyebrow')}</p>
              <div
                className="flex gap-1"
                aria-label={tMe('review.ratingValue', { rating: bookingReview.rating })}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star
                    key={value}
                    className={cn(
                      'size-5 fill-current',
                      value <= bookingReview.rating ? 'text-saffron-gold' : 'text-sarat-black/20',
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              {(loc === 'ar' ? bookingReview.textAr : bookingReview.textEn) && (
                <p className="text-sarat-black-600 text-base leading-relaxed">
                  {loc === 'ar' ? bookingReview.textAr : bookingReview.textEn}
                </p>
              )}
            </div>
          ) : (
            <ReviewForm
              bookingReference={ref}
              locale={loc}
              copy={{
                ...reviewCopy,
                heading: tMe('review.heading'),
                submit: tMe('review.submit'),
                submitting: tMe('review.submitting'),
              }}
            />
          )}
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
                  throttled: t('dispute.errors.throttled'),
                  validation: t('dispute.errors.validation'),
                  server: t('dispute.errors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {/* Contact — WhatsApp deep links. The host line appears once the
          booking is accepted; Gharmish support is there in every state. */}
      {(hostWhatsapp || supportWhatsapp) && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {hostWhatsapp ? t('whatsapp.heading') : t('supportWhatsapp.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {hostWhatsapp ? t('whatsapp.description') : t('supportWhatsapp.description')}
          </p>
          {/* "Will anyone show up?" — the verified receipt, one tap away. */}
          {hostWhatsapp && experience?.host.verified && (
            <VerifiedBadge
              variant="line"
              hostName={loc === 'ar' ? toArabicText(experience.host.name) : experience.host.name}
              locale={loc}
              verifiedAt={experience.host.verifiedAt}
            />
          )}
          <a
            href={hostWhatsapp ?? supportWhatsapp ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'md' }),
              'inline-flex items-center gap-2 self-start',
            )}
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {hostWhatsapp ? t('whatsapp.cta') : t('supportWhatsapp.cta')}
          </a>
          {/* Both lines available: support rides along as a quiet inline
              link under the host CTA. */}
          {hostWhatsapp && supportWhatsapp && (
            <p className="text-sarat-black-600 text-sm leading-relaxed">
              {t('supportWhatsapp.orSupport')}{' '}
              <a
                href={supportWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
              >
                {t('supportWhatsapp.orSupportLink')}
              </a>
            </p>
          )}
        </section>
      )}

      {/* Reschedule — rendered ONLY when the booking's policy snapshot
          allows a move right now (same gate the server action re-checks).
          A lapsed hold is about to be released; moving it would imply the
          spot is still held. */}
      {rescheduleView && !isHoldLapsed && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('reschedule.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {t('reschedule.policy', { deadline: formatDeadline(rescheduleView.deadline) })}
          </p>
          {rescheduleDates.length === 0 ? (
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('reschedule.noDates')}
            </p>
          ) : (
            <RescheduleBooking
              reference={ref}
              locale={loc}
              minDate={todayInRiyadh()}
              maxDate={addDays(todayInRiyadh(), 60)}
              options={rescheduleDates}
              copy={{
                label: t('reschedule.label'),
                pending: t('reschedule.pending'),
                confirmTitle: t('reschedule.heading'),
                // Raw templates — the client substitutes {date} with the
                // chosen option's pre-formatted label.
                confirm: t.raw('reschedule.confirm'),
                done: t.raw('reschedule.done'),
                calendar: {
                  prevMonth: t('reschedule.prevMonth'),
                  nextMonth: t('reschedule.nextMonth'),
                },
                errors: {
                  no_db: t('reschedule.errors.noDb'),
                  not_found: t('reschedule.errors.notFound'),
                  wrong_state: t('reschedule.errors.wrongState'),
                  already_started: t('reschedule.errors.alreadyStarted'),
                  window_passed: t('reschedule.errors.windowPassed'),
                  limit_reached: t('reschedule.errors.limitReached'),
                  date_unavailable: t('reschedule.errors.dateUnavailable'),
                  date_full: t('reschedule.errors.dateFull'),
                  validation: t('reschedule.errors.validation'),
                  server: t('reschedule.errors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {/* Cancellation — only while the booking can still be cancelled.
          A lapsed hold is about to be released anyway; offering "cancel"
          there would imply the spot is still held. */}
      {cancelView && !isHoldLapsed && (
        <section className="border-sarat-black/8 rounded-card mt-10 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('cancel.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {cancelView.refund === 'none_needed'
              ? t('cancel.policyUnpaid')
              : cancelView.refund === 'full'
                ? cancelView.partialDeadline
                  ? // Moderate/strict: disclose the 50% step up front. The
                    // full-refund deadline is the grace-aware one — after a
                    // late booking it can sit past the tier deadline.
                    t('cancel.policyRefundableThenPartial', {
                      deadline: formatDeadline(cancelView.fullRefundUntil),
                      amount: formatSAR(partialAmountSar, loc),
                      partialDeadline: formatDeadline(cancelView.partialDeadline),
                    })
                  : t('cancel.policyRefundable', {
                      deadline: formatDeadline(cancelView.fullRefundUntil),
                    })
                : cancelView.refund === 'partial' && cancelView.partialDeadline
                  ? t('cancel.policyPartial', {
                      amount: formatSAR(cancelView.amountSar, loc),
                      deadline: formatDeadline(cancelView.partialDeadline),
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
                  : cancelView.refund === 'partial'
                    ? t('cancel.confirmPartial', {
                        amount: formatSAR(cancelView.amountSar, loc),
                      })
                    : t('cancel.confirm'),
              done: {
                none: t('cancel.doneUnpaid'),
                refunded: t('cancel.doneRefunded'),
                refunded_partial: t('cancel.donePartialRefunded', {
                  amount: formatSAR(partialAmountSar, loc),
                }),
                refund_pending: t('cancel.doneRefundPending'),
                refund_pending_partial: t('cancel.donePartialRefundPending', {
                  amount: formatSAR(partialAmountSar, loc),
                }),
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
        {canRetryPayment ? (
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
                // While payment is owed, "Complete payment" (header) is the
                // one primary CTA on the page — the exploration link must
                // not compete with it as a second solid button.
                buttonVariants({
                  variant: isAwaitingPayment ? 'secondary' : 'primary',
                  size: 'lg',
                }),
                'inline-flex items-center gap-2',
              )}
            >
              {t('keepExploring')}
              <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
            </Link>
          </>
        )}
      </div>

      {/* Cross-sell on the highest-intent surface in the funnel — but never
          while payment is still owed, where "Complete payment" must stay the
          only story on the page. */}
      {experienceSlug && !isAwaitingPayment && (
        <RelatedExperiences excludeSlug={experienceSlug} locale={loc} />
      )}
    </article>
  );
}
