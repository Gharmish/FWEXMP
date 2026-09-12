import { getPlatformSettings } from '@/lib/platform-settings';
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Clock, MapPin, Star } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { getBookingViewForViewer } from '@/features/bookings/queries';
import { BookingAccessNotice } from '@/features/bookings/components/booking-access-notice';
import { BookingManageSections } from '@/features/bookings/components/booking-manage-sections';
import { confirmationView } from '@/features/bookings/lib/confirmation-view';

import { SITE_URL } from '@/lib/site';

import { PrintButton } from '@/components/ui/print-button';
import { ShareButton } from '@/components/ui/share-button';
import { RelatedExperiences } from '@/features/experiences/components/related-experiences';
import { ensureReferralCode } from '@/features/marketing/referral';
import { GharmishLogo } from '@/components/layout/gharmish-logo';

import { ReviewForm } from '@/features/reviews/components/review-form';
import { getReviewForBooking } from '@/features/reviews/queries';

import { BookingContactForm } from '@/features/bookings/components/booking-contact-form';
import { MeetingPointMap } from '@/features/experiences/components/meeting-point-map';
import { AddToCalendar } from '@/features/bookings/components/add-to-calendar';
import {
  calendarEventDescription,
  googleCalendarUrl,
  googleMapsLink,
} from '@/features/bookings/lib/calendar-links';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { BOOKING_LINK_TOKEN_PARAM, bookingManageUrl } from '@/lib/booking-link-token';

import { RefundToCardButton } from '@/features/wallet/components/refund-to-card-button';
import { RefundBankDetailsForm } from '@/features/bookings/components/refund-bank-details-form';
import { getSessionGuestId } from '@/features/wallet/queries';

import { halalasToSar, vatPortionHalalas, vatRatePercent } from '@/features/bookings/lib/vat';
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
  if (view.state === 'forbidden') return <BookingAccessNotice />;
  const booking = view.state === 'ok' ? view.booking : undefined;
  // The signed link token proves the viewer may READ this booking, not
  // act on it. Every mutating form (cancel / reschedule / review /
  // report / refund bank-details) would fail server-side with a
  // misleading error, so a token-only viewer sees a sign-in prompt in
  // place of each — the refund form especially, since it directs money
  // OUT and a forwardable link must never authorize that.
  const tokenOnly = view.state === 'ok' && view.proof === 'token';
  const experienceSlug = booking?.experienceSlug ?? slugFromQuery;
  // The pay link keeps the signed token too: a viewer admitted by the
  // link alone (WhatsApp's in-app browser holds no cookie) would
  // otherwise bounce straight off the pay page's access check.
  const payHref = `/book/${ref}/pay${[
    experienceSlug ? `slug=${encodeURIComponent(experienceSlug)}` : '',
    token ? `${BOOKING_LINK_TOKEN_PARAM}=${encodeURIComponent(token)}` : '',
  ]
    .filter(Boolean)
    .map((part, i) => (i === 0 ? `?${part}` : `&${part}`))
    .join('')}`;

  const t = await getTranslations('bookingConfirmed');
  const tShare = await getTranslations('share');
  const tSteps = await getTranslations('payment.steps');
  // Meeting-point copy is shared with the experience detail page.
  const tExp = await getTranslations('experienceDetail');

  // Wave A — the page's independent reads, fanned out together instead
  // of the old serial chain (2026-08-28 audit; ≤4 DB queries at once,
  // same pool discipline as the detail page's waves). The referral-code
  // mint stays in the wave rather than `after()`: the share button
  // needs the code IN this render to tag the URL, and after the first
  // visit the call is a pure read.
  const [experience, sessionGuestId, bookingReview, referralCode, tMe] = await Promise.all([
    experienceSlug ? getExperienceBySlug(experienceSlug) : Promise.resolve(undefined),
    booking?.status === 'refunded' && booking.refundMethod === 'wallet'
      ? getSessionGuestId()
      : Promise.resolve(null),
    booking?.status === 'completed' ? getReviewForBooking(booking.id) : Promise.resolve(null),
    booking?.guestId ? ensureReferralCode(booking.guestId) : Promise.resolve(null),
    booking?.status === 'completed' ? getTranslations('me') : Promise.resolve(null),
  ]);

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
  // Every status flag below is derived once, in a unit-tested module,
  // instead of inline across the page (2026-09 engineering audit ARCH-06).
  const {
    isConfirmed,
    isCompleted,
    isCancelled,
    isDeclined,
    isExpired,
    isWalletRefunded,
    refundQueued,
    isProcessingOpen,
    paymentView,
    isHoldLapsed,
    isFailed,
    isPending,
    canRetryPayment,
    isAwaitingPayment,
    checkoutStep,
  } = confirmationView({ booking, paymentHint, now: new Date() });

  // Quiet sign-in prompt that stands in for every mutating form when the
  // viewer was admitted by the read-only link token.
  const signInNotice = (
    <p className="text-sarat-black-600 max-w-xl text-sm leading-relaxed">
      {t('signInToManage')}{' '}
      <Link
        href="/sign-in?next=/me"
        className="text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
      >
        {t('signInToManageCta')}
      </Link>
    </p>
  );
  /** Money-relevant deadlines carry a time-of-day, so render it. */
  const formatDeadline = (d: Date): string =>
    loc === 'ar'
      ? `${formatDate(d, loc)}، ${formatTime(d, loc)}`
      : `${formatDate(d, loc)}, ${formatTime(d, loc)}`;

  // The eyebrow's tracking/case is shared across states; only colour shifts.
  const eyebrowBase = 'text-eyebrow';
  // The reference label keeps the calm juniper treatment in every state.
  const eyebrowClassName = cn(eyebrowBase, 'text-juniper-green-800');

  const walletOwner = isWalletRefunded && booking ? sessionGuestId === booking.guestId : false;
  // The wallet's refund-to-card exception is a gateway reversal; hidden
  // while refunds are wired by hand (MONEY-04, see refund-out-actions.ts).
  const { refundsViaBankTransfer } = await getPlatformSettings();
  const walletCreditSar = booking ? booking.totalAmountSar + booking.walletAppliedSar : 0;
  // Manual bank-transfer refunds (owner decision 2026-08-21): the payee
  // block's copy is shared by the cancel form (collected up front) and
  // the post-cancellation form on a booking whose refund is queued.
  const bankFieldsCopy = {
    bankNameLabel: t('refundBank.bankNameLabel'),
    beneficiaryNameLabel: t('refundBank.beneficiaryNameLabel'),
    beneficiaryNameHint: t('refundBank.beneficiaryNameHint'),
    ibanLabel: t('refundBank.ibanLabel'),
    ibanHint: t('refundBank.ibanHint'),
    ibanReenterHint: t('refundBank.ibanReenterHint'),
    errors: {
      bank_name_invalid: t('refundBank.errors.bankName'),
      beneficiary_name_invalid: t('refundBank.errors.beneficiaryName'),
      iban_invalid: t('refundBank.errors.iban'),
    },
  };
  // Referral share tag for the invite-friends button below — minted
  // lazily (in wave A) on the guest's first visit here; null (mint
  // failure / no booking) degrades to the plain share URL.
  const referralShareSuffix = referralCode ? `?ref=${referralCode}` : '';
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
              : isConfirmed || isCompleted
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
              : isConfirmed || isCompleted
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
                : isCompleted
                  ? t('completedEyebrow')
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
                : isCompleted
                  ? t('completedTitle')
                  : isConfirmed
                    ? t('titleConfirmed')
                    : t('title');
  const headerDescription = isCancelled
    ? isWalletRefunded
      ? t('cancelledDescriptionWalletCredit', { amount: formatSAR(walletCreditSar, loc) })
      : booking?.status === 'refunded'
        ? // The refund copy must name where the money actually went —
          // "your card" on the manual (bank-transfer) rail pointed
          // guests at the wrong statement (2026-08-28 audit P1-3). The
          // admin stamps refundMethod 'manual' even for a record-only
          // card reversal, so "to your bank account" is only honest when
          // payee details are actually on file.
          booking.refundMethod === 'manual' && booking.refundBank
          ? t('cancelledDescriptionRefundedBank')
          : t('cancelledDescriptionRefunded')
        : // A queued refund only names the bank account once the guest has
          // provided one; before that (host/admin cancels, no payee yet)
          // the generic pending copy is the honest line, and the
          // bank-details form below does the asking.
          refundQueued && booking?.refundBank
          ? t('cancelledDescriptionRefundPendingBank')
          : t('cancelledDescription')
    : isDeclined
      ? t('declinedDescription')
      : isExpired
        ? t('expiredDescription')
        : isHoldLapsed
          ? // Applied credit was debited at apply time and is only
            // released by the cron — say so, or the guest watches a
            // missing balance under "nothing was charged".
            booking && booking.walletAppliedSar > 0
            ? `${t('holdLapsedDescription')} ${t('holdLapsedWalletCredit', {
                amount: formatSAR(booking.walletAppliedSar, loc),
              })}`
            : t('holdLapsedDescription')
          : isFailed
            ? t('paymentFailedDescription')
            : isPending
              ? t('paymentPendingDescription')
              : isAwaitingPayment && booking?.paymentDeadline
                ? t('approvedDescription', {
                    deadline: formatDeadline(new Date(booking.paymentDeadline)),
                  })
                : // No booking here means exactly one thing now: no DB at
                  // all. Unauthorized viewers returned above, unknown
                  // references 404'd — neither reaches this preview copy.
                  !booking
                  ? t('descriptionPreview')
                  : isCompleted
                    ? t('completedDescription')
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
          <Price
            amount={halalasToSar(vatPortionHalalas(booking.totalAmountSar, booking.vatRateBps))}
            locale={loc}
          />
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

  // Review entry for ANY completed booking — this page is reachable from
  // the booking history, so reviews are no longer limited to the /me
  // "last booking" card. The review itself (and its `me` catalog) load
  // in wave A above.
  const reviewEditable = bookingReview
    ? new Date(bookingReview.editableUntil).getTime() > new Date().getTime()
    : false;
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

  // Contact typo safety net (2026-08-28 audit): while the request is
  // pending or payment is still owed, show which unverified email/phone
  // the notifications go to, with an inline corrector. Never for
  // token-only viewers — the update action requires the cookie/session.
  const contactEditable = Boolean(
    booking &&
    !tokenOnly &&
    booking.guestEmail &&
    (booking.status === 'pending' || isAwaitingPayment),
  );

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
    <article className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-20">
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
          className="mb-12 print:hidden"
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
        <h1 className="text-h1">{headerTitle}</h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
          {headerDescription}
        </p>
        {respondByNote && <p className="text-pending text-base font-medium">{respondByNote}</p>}
        {isAwaitingPayment && (
          <Link
            href={payHref}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'self-start')}
          >
            {t('payNow')}
          </Link>
        )}
        {/* Which unverified address the confirmation/pay link goes to,
            with the typo corrector — one wrong character here orphans
            the booking. LTR isolates keep the email/phone from
            scrambling inside Arabic sentences. */}
        {booking && contactEditable && booking.guestEmail && (
          <div className="flex flex-col gap-2">
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {booking.guestPhone
                ? t('contact.sendToWithPhone', {
                    email: `\u2066${booking.guestEmail}\u2069`,
                    phone: `\u2066${booking.guestPhone}\u2069`,
                  })
                : t('contact.sendTo', { email: `\u2066${booking.guestEmail}\u2069` })}
            </p>
            <BookingContactForm
              reference={ref}
              locale={loc}
              defaults={{ email: booking.guestEmail, phone: booking.guestPhone }}
              copy={{
                summary: t('contact.updateSummary'),
                emailLabel: t('contact.emailLabel'),
                phoneLabel: t('contact.phoneLabel'),
                countryLabel: t('contact.countryLabel'),
                submit: t('contact.submit'),
                pending: t('contact.pending'),
                done: t('contact.done'),
                errors: {
                  required: t('contact.errors.required'),
                  invalid_email: t('contact.errors.invalidEmail'),
                  invalid_phone: t('contact.errors.invalidPhone'),
                },
                formErrors: {
                  forbidden: t('contact.errors.forbidden'),
                  no_db: t('contact.errors.noDb'),
                  not_found: t('contact.errors.notFound'),
                  wrong_state: t('contact.errors.wrongState'),
                  account_email: t('contact.errors.accountEmail'),
                  validation: t('contact.errors.validation'),
                  server: t('contact.errors.server'),
                },
              }}
            />
          </div>
        )}
        {isProcessingOpen && (
          <p className="text-sarat-black-600 max-w-2xl text-sm leading-relaxed">
            {t('processingOpenNote')}
          </p>
        )}
        {(isPending || isProcessingOpen) && (
          <PendingPaymentRefresh
            // The prepared-but-unattempted state must not assert "still
            // processing / no need to pay again" under a working pay
            // button — its poller copy is neutral about whether the
            // guest paid.
            label={t('paymentChecking')}
            stalledLabel={
              isProcessingOpen ? t('processingOpenStillChecking') : t('paymentStillChecking')
            }
            refreshLabel={t('paymentCheckAgain')}
          />
        )}
      </header>

      <section
        className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-4 [border-width:0.5px] p-6"
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
              <p className="text-sarat-black-600 inline-flex items-center gap-2 text-sm">
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
              className="border-sarat-black/12 mt-1 block border-t [border-top-width:0.5px] border-dashed"
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
              className="border-sarat-black/12 mt-1 block border-t [border-top-width:0.5px] border-dashed"
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
          <section className="mt-12 flex flex-col gap-3 print:hidden">
            <h2 className="text-h2 flex items-center gap-3">
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
      {/* Manual bank-transfer refund: the money is queued for the admin to
          wire, and this is where the guest tells us (or corrects) where.
          Rendered for every refund path that didn't pass through the
          guest's own cancel form — host/admin/support cancellations. */}
      {refundQueued && booking && (
        <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-4 [border-width:0.5px] p-6 print:hidden">
          <h2 className="text-h2">{t('refundBank.heading')}</h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {booking.refundBank
              ? t('refundBank.onFile', { amount: formatSAR(booking.refundDueSar ?? 0, loc) })
              : t('refundBank.description', { amount: formatSAR(booking.refundDueSar ?? 0, loc) })}
          </p>
          {tokenOnly ? (
            // Submitting bank details directs the refund OUT to an
            // account, so — unlike checkout — the forwardable link token
            // is NOT enough: an account holder must be signed in. The
            // token still gives the read view above; this prompts sign-in.
            signInNotice
          ) : (
            <RefundBankDetailsForm
              reference={ref}
              locale={loc}
              existing={
                booking.refundBank
                  ? {
                      bankName: booking.refundBank.bankName,
                      beneficiaryName: booking.refundBank.beneficiaryName,
                      // Masked at the query layer — the full IBAN never
                      // reaches the page; changing it means retyping it.
                      ibanMasked: booking.refundBank.ibanMasked,
                    }
                  : null
              }
              copy={{
                ...bankFieldsCopy,
                submit: t('refundBank.submit'),
                update: t('refundBank.update'),
                pending: t('refundBank.pending'),
                done: t('refundBank.done'),
                formErrors: {
                  not_found: t('refundBank.formErrors.notFound'),
                  wrong_state: t('refundBank.formErrors.wrongState'),
                  no_db: t('refundBank.formErrors.noDb'),
                  validation: t('refundBank.formErrors.validation'),
                  server: t('refundBank.formErrors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {isWalletRefunded && booking && (
        <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-4 [border-width:0.5px] p-6 print:hidden">
          <h2 className="text-h2">{t('walletCredit.heading')}</h2>
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
            {walletOwner && !refundsViaBankTransfer && booking.totalAmountSar > 0 && (
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
          or is still processing, and on completed bookings (nothing is
          "next" any more; the header points at the review instead). */}
      {!isFailed &&
        !isPending &&
        !isCancelled &&
        !isDeclined &&
        !isExpired &&
        !isAwaitingPayment &&
        !isHoldLapsed &&
        !isCompleted && (
          <section className="mt-12 flex flex-col gap-3">
            <h2 className="text-h2">{t('nextStepsHeading')}</h2>
            <ol className="mt-1 flex flex-col gap-4">
              {[
                isConfirmed ? t('nextStepConfirmed1') : t('nextStep1'),
                isConfirmed ? t('nextStepConfirmed2') : t('nextStep2'),
                isConfirmed ? t('nextStepConfirmed3') : t('nextStep3'),
              ].map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  {/* Decorative order marker — the ol carries the semantics. */}
                  <span
                    className="border-sarat-black/12 bg-mist text-sarat-black-600 flex size-6 shrink-0 items-center justify-center rounded-full [border-width:0.5px] text-xs font-medium"
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
          className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-4 [border-width:0.5px] p-6 print:hidden"
        >
          {/* Section-level h2 like every sibling — the form's own
              heading is an h3 beneath it, keeping the outline h1→h2→h3
              instead of skipping straight to h3. */}
          <h2 className="text-h2">{t('reviewHeading')}</h2>
          {bookingReview && reviewEditable && !tokenOnly ? (
            <ReviewForm
              bookingReference={ref}
              locale={loc}
              guestName={booking.guestName}
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
          ) : tokenOnly ? (
            // The submit action needs the cookie/session — a token-only
            // viewer would compose a review only to lose it to a
            // misleading error, so prompt for sign-in instead.
            signInNotice
          ) : (
            <ReviewForm
              bookingReference={ref}
              locale={loc}
              guestName={booking.guestName}
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

      {/* Report / contact / reschedule / cancel — one streamed section
          (2026-09 engineering audit REACT-04): its dispute, host-phone and
          schedule reads no longer hold up the page's first byte. */}
      {booking && (
        <Suspense fallback={<div className="min-h-64" aria-hidden />}>
          <BookingManageSections
            booking={booking}
            reference={ref}
            locale={loc}
            experience={experience}
            tokenOnly={tokenOnly}
            isHoldLapsed={isHoldLapsed}
            bankFieldsCopy={bankFieldsCopy}
          />
        </Suspense>
      )}
      <div className="mt-12 flex flex-wrap gap-3 print:hidden">
        {canRetryPayment ? (
          <>
            <Link href={payHref} className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}>
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
