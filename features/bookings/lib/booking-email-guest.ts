import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasHyperpay } from '@/lib/env';
import { formatDate, formatSAR, formatTime } from '@/lib/format';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { SITE_URL } from '@/lib/site';
import { getBookingByReference } from '@/features/bookings/queries';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { splitCommission } from '@/features/bookings/lib/commission';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { guestBookingUrls } from './booking-email-links';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';
import { getPlatformSettings } from '@/lib/platform-settings';
import {
  bidiIsolate,
  REFUND_LINES,
  guestBookingPath,
  guestInvoicePath,
  guestPayPath,
  guestReviewPath,
  waDate,
  waDateTime,
  waMoney,
  waTime,
  whatsappPayload,
} from '@/lib/notifications/whatsapp';
import {
  EMAIL_LOGO_URL,
  KSA_TIME,
  KSA_DATE,
  lifecycleDetails,
  hostEmailContext,
  hostRows,
} from './booking-email-shared';

/**
 * Guest lifecycle notices: cancellation, reschedule, request received,
 * approved, awaiting payment, declined, expired, lapsed, on hold,
 * completed (guest + host) and payment failed.
 *
 * Split out of booking-email.ts (2026-09 engineering audit ARCH-07: one
 * 2,100-line module with 20 senders). The index module re-exports every
 * sender, so callers and mocks keep importing from booking-email.
 */

/**
 * Send the cancellation notice after a booking is called off. `refund`
 * mirrors the cancel action's outcome: `refunded` (gateway refund
 * issued), `refund_pending` (we owe it, transfer is manual),
 * `wallet_credited` (emergency cancellation — the full payment landed
 * as Gharmish Credit), `forfeited` (inside the window, payment kept),
 * `none` (nothing was paid). `cancelledBy` selects the framing: `guest`
 * ("you cancelled") vs `operator` (host/admin called it off — always
 * refunded in full when paid, never forfeited). Same best-effort
 * posture as the receipt: gated, never throws upward.
 */
export async function sendBookingCancellationEmail(
  reference: string,
  refund: 'none' | 'refunded' | 'refund_pending' | 'wallet_credited' | 'forfeited',
  options?: {
    cancelledBy?: 'guest' | 'host' | 'operator';
    /**
     * Amount actually refunded (or queued) — pass it for partial
     * policy refunds; defaults to the full charge when omitted.
     */
    refundAmountSar?: number;
  },
): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking) return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  // Stored preference, not the caller's context — admin cancellations
  // used to inherit the OPERATOR's UI locale.
  const locale = booking.guestPreferredLanguage;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = startInstant(booking.date, booking.startTime);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale, KSA_TIME) });
  // The amount originally paid, so a partial refund is verifiable
  // against it at a glance.
  if (booking.paidAt) {
    // The FULL paid base — card charge plus any redeemed Gharmish Credit
    // (2026-08-01 ninth audit). `totalAmountSar` is the card leg alone,
    // so a wallet-assisted booking told the guest they had paid less
    // than they did, directly above a refund line for the larger real
    // amount.
    const paidBaseSar = booking.totalAmountSar + booking.walletAppliedSar;
    rows.push({ label: t('totalLabel'), value: formatSAR(paidBaseSar, locale) });
  }
  if (refund === 'refunded' || refund === 'refund_pending' || refund === 'wallet_credited') {
    rows.push({
      label: t(refund === 'wallet_credited' ? 'walletCreditLabel' : 'refundLabel'),
      value: formatSAR(options?.refundAmountSar ?? booking.totalAmountSar, locale),
    });
  }
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  // Three framings (2026-08-22): the guest cancelled ("your booking has
  // been cancelled"), the host couldn't run it, or the Gharmish team
  // called it off — admin cancellations used to borrow the host framing
  // and blame the host for an ops decision.
  const framing =
    options?.cancelledBy === 'host'
      ? 'cancelByHost'
      : options?.cancelledBy === 'operator'
        ? 'cancelByOps'
        : 'cancel';
  // Which rail the money travels (2026-08-28 P1-3): the manual
  // bank-transfer rail (platform default since 2026-08-21) must never
  // claim "your card". Refunded → the stamped refundMethod is
  // authoritative, guarded on details actually being on file (the
  // admin's record-only arm also stamps 'manual' for gateway-console
  // reversals, which DO reach the card). Pending → payee details on
  // file mean a queued bank transfer; none, with the manual rail on,
  // means the refund cannot move until the guest tells us where (P0-2)
  // — so ask, via the tokened BOOKING page where the bank-details form
  // lives, never the invoice. The settings read degrades to the manual
  // default on error, same as executeRefund.
  const refundedToBank =
    refund === 'refunded' && booking.refundMethod === 'manual' && booking.refundBank !== null;
  const pendingToBank = refund === 'refund_pending' && booking.refundBank !== null;
  const pendingNeedsBank =
    refund === 'refund_pending' &&
    booking.refundBank === null &&
    (await getPlatformSettings()).refundsViaBankTransfer;
  const intro =
    refund === 'refunded'
      ? t(refundedToBank ? `${framing}IntroRefundedBank` : `${framing}IntroRefunded`)
      : refund === 'refund_pending'
        ? t(
            pendingNeedsBank
              ? `${framing}IntroRefundPendingNeedsBank`
              : pendingToBank
                ? `${framing}IntroRefundPendingBank`
                : `${framing}IntroRefundPending`,
          )
        : refund === 'wallet_credited'
          ? t('cancelIntroWalletCredited')
          : refund === 'forfeited'
            ? t('cancelIntroForfeited')
            : t(`${framing}IntroUnpaid`);

  // Refunded (or refund-owed) payments get a link to the invoice page,
  // which carries the credit note for VAT-stamped bookings and the
  // refunded receipt otherwise — EXCEPT a queued refund with no payee on
  // file, which links the booking page where the bank-details form
  // lives. Wallet credits link to the booking page too — that's where
  // the guest chooses "spend it" vs "back to my card". Forfeited/unpaid
  // cancellations have no money document.
  const urls = guestBookingUrls(locale, reference, booking.experienceSlug);
  const showDocument = (refund === 'refunded' || refund === 'refund_pending') && !pendingNeedsBank;
  const walletCta =
    refund === 'wallet_credited' ? { label: t('viewWalletCredit'), url: urls.manage } : undefined;
  // The single action a payee-less refund needs: add the bank details.
  const needsBankCta = pendingNeedsBank
    ? { label: t('refundNeedsBankCta'), url: urls.manage }
    : undefined;
  const cancelSubject = t('cancelSubject', { reference: bidiIsolate(booking.referenceCode) });
  const cancelCtaUrl = showDocument
    ? urls.invoice
    : ((needsBankCta ?? walletCta)?.url ?? urls.manage);
  // One system-owned sentence for the WhatsApp refund line (plan §22).
  const refundAmountText = waMoney(options?.refundAmountSar ?? booking.totalAmountSar, locale);
  const refundLine =
    refund === 'refunded'
      ? REFUND_LINES.refunded[locale](refundAmountText)
      : refund === 'refund_pending'
        ? (pendingNeedsBank ? REFUND_LINES.needs_payee : REFUND_LINES.refund_pending)[locale](
            refundAmountText,
          )
        : refund === 'wallet_credited'
          ? REFUND_LINES.wallet[locale](refundAmountText)
          : refund === 'forfeited'
            ? REFUND_LINES.forfeited[locale]()
            : REFUND_LINES.none[locale]();
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: cancelSubject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro,
    rows,
    cta: showDocument
      ? {
          label: booking.vatRateBps ? t('viewCreditNote') : t('viewReceipt'),
          url: cancelCtaUrl,
        }
      : (needsBankCta ?? walletCta),
    closing: t('cancelClosing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: 'booking_cancelled',
    // Scoped by refund VERDICT, not just the booking (2026-07-28 third
    // audit). A booking is legitimately notified twice with different
    // news: first "cancelled, payment forfeited", then — after an admin
    // settles it from /admin/bookings, a state that action explicitly
    // accepts — "cancelled, refunded". Keyed on the reference alone the
    // second notice hit the first's `sent` ledger row and was dropped,
    // so money moved, the guest was never told, no credit note reached
    // them, and the ledger read as a healthy success.
    dedupeKey: `booking_cancelled:${booking.referenceCode}:${refund}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: cancelSubject, html, text },
    whatsapp: whatsappPayload(
      'guest_booking_cancelled',
      locale,
      {
        experienceName: title ?? t('genericExperience'),
        date: waDate(startsAt, locale),
        refundStatus: refundLine,
        bookingPath: showDocument
          ? guestInvoicePath(locale, reference)
          : guestBookingPath(locale, reference),
        // legacy slots
        guestName: booking.guestName,
        time: waTime(startsAt, locale),
        reference: bidiIsolate(booking.referenceCode),
        ctaUrl: cancelCtaUrl,
      },
      { reference: booking.referenceCode, refund },
    ),
  });
}

/**
 * The guest moved their booking to a new date. Sent AFTER the row was
 * updated, so the standard detail rows carry the NEW date/time; the old
 * date arrives as a parameter for the "moved from" line. Payment is
 * untouched by a reschedule, so no money rows appear.
 */
export async function sendBookingRescheduledEmail(
  reference: string,
  oldDate: string,
): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking) return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const movedFrom = startInstant(oldDate, booking.startTime);
  const rows = [
    { label: t('movedFromLabel'), value: formatDate(movedFrom, locale, 'gregory', KSA_DATE) },
    ...details.rows,
  ];

  const bookingUrl = guestBookingUrls(locale, reference, booking.experienceSlug).manage;
  const subject = t('rescheduledSubject', { reference: bidiIsolate(booking.referenceCode) });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('rescheduledIntro'),
    heroImage: details.hero,
    rows,
    cta: { label: t('rescheduledCta'), url: bookingUrl },
    closing: t('rescheduledClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_rescheduled',
    // Scoped by the new date so a future policy allowing several moves
    // still notifies each one.
    dedupeKey: `booking_rescheduled:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'guest_booking_rescheduled',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        date: waDate(details.startsAt, locale),
        time: waTime(details.startsAt, locale),
        bookingPath: guestBookingPath(locale, reference),
        guestName: booking.guestName,
        reference: bidiIsolate(booking.referenceCode),
        bookingUrl,
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * Acknowledge a guest's booking request (request-to-book only): "the host
 * has X hours to confirm; you won't be charged until then." No-ops for
 * instant bookings (their ack is the payment receipt) and for guests
 * without an email on file. Best-effort like every sender here.
 */
export async function sendBookingRequestReceivedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'pending') return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  if (booking.approvalDeadline) {
    // Date AND time — the deadline expires at a wall-clock moment, and a
    // bare date reads as "end of that day".
    const d = new Date(booking.approvalDeadline);
    rows.push({
      label: t('approvalDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('requestReceivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('requestReceivedIntro'),
    heroImage: details.hero,
    rows,
    closing: t('requestReceivedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_request_received',
    dedupeKey: `booking_request_received:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: t('requestReceivedSubject'), html, text },
    whatsapp: whatsappPayload(
      'guest_request_received',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        date: waDate(details.startsAt, locale),
        time: waTime(details.startsAt, locale),
        bookingPath: guestBookingPath(locale, reference),
        guestName: booking.guestName,
        reference: bidiIsolate(booking.referenceCode),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * The host approved a request. Pay-after-approval: when online payment is
 * configured the email carries the payment link and the window deadline;
 * when payment is off the booking is simply confirmed. Locale follows the
 * guest's preferred language (the action caller may be the host/admin).
 */
export async function sendBookingApprovedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'confirmed') return;
  if (!booking.guestEmail && !booking.guestPhone) return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });

  const needsPayment =
    hasHyperpay() && booking.paymentStatus !== 'paid' && booking.paymentDeadline !== null;
  const urls = guestBookingUrls(locale, reference, booking.experienceSlug);
  const payUrl = urls.pay;
  if (needsPayment && booking.paymentDeadline) {
    // Date AND time — the spot is released at a wall-clock moment.
    const d = new Date(booking.paymentDeadline);
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const approvedSubject = t('approvedSubject', { reference: bidiIsolate(booking.referenceCode) });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: approvedSubject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: needsPayment ? t('approvedPayIntro') : t('approvedIntro'),
    heroImage: details.hero,
    rows,
    // The payment link is the single action this email exists for — a
    // button, not a raw URL pasted into the intro (many clients never
    // linkify plain text, and a `?slug=` query breaks partial linkifiers).
    cta: needsPayment
      ? { label: t('completePaymentCta'), url: payUrl }
      : { label: t('rescheduledCta'), url: urls.manage },
    closing: needsPayment ? t('approvedPayClosing') : t('approvedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_approved',
    dedupeKey: `booking_approved:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: approvedSubject, html, text },
    whatsapp: whatsappPayload(
      'guest_booking_approved',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        date: waDate(details.startsAt, locale),
        time: waTime(details.startsAt, locale),
        payDeadline:
          needsPayment && booking.paymentDeadline
            ? waDateTime(new Date(booking.paymentDeadline), locale)
            : waDate(details.startsAt, locale),
        payPath: needsPayment
          ? guestPayPath(locale, reference, booking.experienceSlug)
          : guestBookingPath(locale, reference),
        guestName: booking.guestName,
        payUrl: needsPayment ? payUrl : urls.manage,
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * Payment-hold rail (2026-08-15 marketing audit). One sender, two stages:
 *
 *  - `created`: fired right after an INSTANT booking is inserted. The
 *    guest is usually still on the pay page — but the abandoners are
 *    exactly the ones who never see it again, and before this an
 *    abandoned instant booking generated ZERO guest contact until the
 *    cron's "your hold lapsed" post-mortem, up to a day later.
 *  - `reminder`: fired by the hourly cron ~2 hours before the hold
 *    lapses, while there is still time to act.
 *
 * Distinct types/dedupe keys per stage, so the ledger allows exactly one
 * of each per booking and the hourly cron can re-enter safely.
 */
export async function sendBookingAwaitingPaymentEmail(
  reference: string,
  stage: 'created' | 'reminder',
): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking) return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  // Only while the hold is real: unpaid, with a live future deadline.
  // Paid → the receipt owns the story; lapsed → the lapse email does.
  if (booking.paymentStatus === 'paid' || !booking.paymentDeadline) return;
  if (booking.status !== 'confirmed' && booking.status !== 'pending') return;
  const deadline = new Date(booking.paymentDeadline);
  if (deadline.getTime() <= Date.now()) return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  // Date AND time — the spot is released at a wall-clock moment.
  const deadlineValue = `${formatDate(deadline, locale, 'gregory', KSA_DATE)}, ${formatTime(deadline, locale, KSA_TIME)}`;
  rows.push({ label: t('paymentDeadlineLabel'), value: deadlineValue });

  const payUrl = guestBookingUrls(locale, reference, booking.experienceSlug).pay;
  const type = stage === 'created' ? 'booking_awaiting_payment' : 'booking_payment_reminder';
  const subject = t(stage === 'created' ? 'awaitingPaymentSubject' : 'paymentReminderSubject', {
    reference: booking.referenceCode,
  });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t(stage === 'created' ? 'awaitingPaymentIntro' : 'paymentReminderIntro'),
    heroImage: details.hero,
    rows,
    cta: { label: t('completePaymentCta'), url: payUrl },
    closing: t('awaitingPaymentClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type,
    dedupeKey: `${type}:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      stage === 'created' ? 'guest_payment_pending' : 'guest_payment_reminder',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        holdDeadline: waDateTime(deadline, locale),
        payPath: guestPayPath(locale, reference, booking.experienceSlug),
      },
      { reference: booking.referenceCode, stage },
    ),
  });
}

/** The host declined the request. Nothing was ever charged. */
export async function sendBookingDeclinedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'declined') return;
  if (!booking.guestEmail && !booking.guestPhone) return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('declinedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('declinedIntro'),
    rows,
    closing: t('declinedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_declined',
    dedupeKey: `booking_declined:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: t('declinedSubject'), html, text },
    whatsapp: whatsappPayload(
      'guest_booking_declined',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        date: waDate(details.startsAt, locale),
        discoverPath: `${locale}/experiences`,
        guestName: booking.guestName,
        time: waTime(details.startsAt, locale),
        reference: bidiIsolate(booking.referenceCode),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/** The approval window lapsed with no host decision. Nothing was charged. */
export async function sendBookingExpiredEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'expired') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const { rows } = await lifecycleDetails(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('expiredSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('expiredIntro'),
    rows,
    // The closing copy says "you can send a new request" — give it the
    // button it promises (2026-08-02 ops audit: this email was a dead
    // end, apology with no link, on the exact guest most worth saving).
    cta: booking.experienceSlug
      ? {
          label: t('expiredCta'),
          url: `${SITE_URL}/${locale}/experiences/${booking.experienceSlug}`,
        }
      : undefined,
    closing: t('expiredClosing'),
    footer: t('footer'),
  });
  // Email-only for now (no approved WhatsApp template planned for the
  // expiry edge case) — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'booking_expired',
    dedupeKey: `booking_expired:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guestEmail, locale },
    email: { subject: t('expiredSubject'), html, text },
  });
}

/**
 * An unpaid hold lapsed and the cron released the spot — either an
 * approved request the guest never paid for, or an abandoned instant
 * booking. Nothing was charged.
 */
export async function sendBookingPaymentLapsedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'cancelled') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const { rows } = await lifecycleDetails(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('paymentLapsedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('paymentLapsedIntro'),
    rows,
    // Same rationale as the expired email: the copy invites a re-book,
    // so the button must exist (2026-08-02 ops audit).
    cta: booking.experienceSlug
      ? {
          label: t('paymentLapsedCta'),
          url: `${SITE_URL}/${locale}/experiences/${booking.experienceSlug}`,
        }
      : undefined,
    closing: t('paymentLapsedClosing'),
    footer: t('footer'),
  });
  // Email-only for now — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'booking_payment_lapsed',
    dedupeKey: `booking_payment_lapsed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guestEmail, locale },
    email: { subject: t('paymentLapsedSubject'), html, text },
  });
}

/**
 * The host was suspended while this guest held an upcoming active
 * booking (2026-08-02 ops audit P0-1). Suspension pauses the listings
 * and deliberately silences reminders — but that left the guest with a
 * paid or pending plan and no signal at all until they showed up to a
 * withdrawn experience. Plain-language hold notice: the admin queue owns
 * the cancel/refund decision per booking, so this email promises
 * follow-up, never an outcome.
 */
export async function sendBookingOnHoldEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || (!booking.guestEmail && !booking.guestPhone)) return;
  // Only bookings still live at send time — a guest who cancelled
  // between the suspension and this send needs no hold notice.
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const { rows } = details;

  const subject = t('onHoldSubject', { reference: bidiIsolate(booking.referenceCode) });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('onHoldIntro'),
    rows,
    closing: t('onHoldClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_on_hold',
    dedupeKey: `booking_on_hold:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guestEmail, phone: booking.guestPhone, locale },
    email: booking.guestEmail ? { subject, html, text } : undefined,
    whatsapp: whatsappPayload(
      'guest_booking_on_hold',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        date: waDate(details.startsAt, locale),
        bookingPath: guestBookingPath(locale, reference),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * Booking completed — close the loop on both sides (2026-07-31 audit:
 * this was the single largest silent transition; it gates reviews AND
 * payouts, yet nobody heard about it).
 *
 *  - Guest: "how was it?" review invitation. Reviews are only possible
 *    on completed bookings, so this is the moment to ask.
 *  - Host: the booking is complete and its payout is now owed.
 *
 * Fired by the cron's auto-complete pass and by manual host/admin
 * completion. Both sides are individually best-effort and dedupe on the
 * reference, so the two triggers can't double-send.
 */
export async function sendBookingCompletedEmails(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'completed') return;

  // --- Guest: review invitation. -------------------------------------
  if (booking.guestEmail || booking.guestPhone) {
    const locale = booking.guestPreferredLanguage;
    const t = await getTranslations({ locale, namespace: 'bookingEmail' });
    const details = await lifecycleDetails(booking, locale, t);
    const experienceName = details.title ?? t('genericExperience');

    const subject = t('reviewInviteSubject', { experience: experienceName });
    const { html, text } = renderReceiptEmail({
      logoUrl: EMAIL_LOGO_URL,
      subject,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      greeting: t('greeting', { name: booking.guestName }),
      intro: t('reviewInviteIntro', { experience: experienceName }),
      heroImage: details.hero,
      rows: details.rows,
      // Deep-link the review composer on THIS booking's page (the
      // unguessable reference is the capability, as everywhere else) —
      // the old `/me` landing added a find-your-booking hop that review
      // volume paid for.
      cta: {
        label: t('reviewInviteCta'),
        url: guestBookingUrls(locale, reference, booking.experienceSlug).review,
      },
      closing: t('reviewInviteClosing'),
      footer: t('footer'),
    });
    await dispatchNotification({
      type: 'booking_completed_review',
      dedupeKey: `booking_completed_review:${booking.referenceCode}`,
      bookingId: booking.id,
      recipient: {
        kind: 'guest',
        email: booking.guestEmail,
        phone: booking.guestPhone,
        locale,
      },
      email: { subject, html, text },
      // Reviews gate the home page's social proof, and most guests are
      // phone-first — the email-only invite was the single point where
      // phone-only guests fell out of the loop entirely. Skips cleanly
      // until the template SID is approved and configured.
      whatsapp: whatsappPayload(
        'guest_review_invite',
        locale,
        { experienceName, reviewPath: guestReviewPath(locale, reference) },
        { reference: booking.referenceCode },
      ),
    });
  }

  // --- Host: completed + payout now owed. -----------------------------
  if (booking.experienceSlug) {
    const host = await hostEmailContext(booking.experienceSlug);
    if (host) {
      const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
      const { payoutSar } = splitCommission(
        booking.totalAmountSar,
        booking.commissionBps,
        booking.vatRateBps,
        booking.discountSar,
        booking.walletAppliedSar,
      );
      const rows = hostRows(booking, host, t);
      rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

      const subject = t('hostCompletedSubject', { experience: host.title });
      const { html, text } = renderReceiptEmail({
        logoUrl: EMAIL_LOGO_URL,
        subject,
        dir: host.locale === 'ar' ? 'rtl' : 'ltr',
        greeting: t('hostNewGreeting'),
        intro: t('hostCompletedIntro'),
        rows,
        cta: { label: t('hostEarningsCta'), url: `${SITE_URL}/${host.locale}/host/earnings` },
        closing: t('hostNewClosing'),
        footer: t('footer'),
      });
      await dispatchNotification({
        type: 'host_booking_completed',
        dedupeKey: `host_booking_completed:${booking.referenceCode}`,
        bookingId: booking.id,
        recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
        email: { subject, html, text },
        whatsapp: whatsappPayload(
          'host_booking_completed',
          host.locale,
          {
            experienceName: host.title,
            payout: waMoney(payoutSar, host.locale),
            earningsPath: `${host.locale}/host/earnings`,
          },
          { reference: booking.referenceCode },
        ),
      });
    }
  }
}

/**
 * The gateway rejected the guest's payment attempt. Without this the
 * guest heard NOTHING between the failed 3DS screen and the hold-lapsed
 * notice hours later — the spot is still held until the payment
 * deadline, so a prompt retry usually saves the booking. Email-only;
 * best-effort like every sender here.
 */
export async function sendBookingPaymentFailedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.paymentStatus !== 'failed') return;
  if (booking.status === 'cancelled' || booking.status === 'completed') return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  if (booking.paymentDeadline) {
    const d = new Date(booking.paymentDeadline);
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const payUrl = guestBookingUrls(locale, reference, booking.experienceSlug).pay;
  const subject = t('paymentFailedSubject', { reference: bidiIsolate(booking.referenceCode) });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('paymentFailedIntro'),
    rows,
    cta: { label: t('paymentFailedCta'), url: payUrl },
    closing: t('paymentFailedClosing'),
    footer: t('footer'),
  });
  // Deduped per reference: one nudge per booking, not one per failed
  // attempt — repeated declines shouldn't turn into repeated mail.
  await dispatchNotification({
    type: 'booking_payment_failed',
    dedupeKey: `booking_payment_failed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'guest_payment_failed',
      locale,
      {
        experienceName: details.title ?? t('genericExperience'),
        payPath: guestPayPath(locale, reference, booking.experienceSlug),
      },
      { reference: booking.referenceCode },
    ),
  });
}
