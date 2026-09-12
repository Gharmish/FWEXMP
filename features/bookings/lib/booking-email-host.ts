import 'server-only';

import { getTranslations } from 'next-intl/server';
import { formatDate, formatInteger, formatSAR } from '@/lib/format';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { getBookingByReference } from '@/features/bookings/queries';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { splitCommission } from '@/features/bookings/lib/commission';
import { renderReceiptEmail } from './booking-email-render';
import {
  hostBookingPath,
  waDate,
  waDateTime,
  waGuests,
  waMoney,
  waTime,
  whatsappPayload,
} from '@/lib/notifications/whatsapp';
import {
  EMAIL_LOGO_URL,
  hostEmailContext,
  hostRows,
  hostBookingsUrl,
} from './booking-email-shared';

/**
 * Host-facing notices: new booking, guest cancelled, rescheduled, hold
 * lapsed, payment received and platform cancellation.
 *
 * Split out of booking-email.ts (2026-09 engineering audit ARCH-07: one
 * 2,100-line module with 20 senders). The index module re-exports every
 * sender, so callers and mocks keep importing from booking-email.
 */

/**
 * "You have a new booking" notice to the host. Locale follows the
 * host's first listed language (Arabic-first default).
 */
export async function sendHostNewBookingEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    booking.totalAmountSar,
    booking.commissionBps,
    booking.vatRateBps,
    booking.discountSar,
    booking.walletAppliedSar,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const isRequest = booking.status === 'pending';
  const subject = isRequest
    ? t('hostNewRequestSubject', { experience: host.title })
    : t('hostNewBookingSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: isRequest ? t('hostNewRequestIntro') : t('hostNewBookingIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });

  const type = isRequest ? 'host_new_request' : 'host_new_booking';
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type,
    dedupeKey: `${type}:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      isRequest ? 'host_booking_request' : 'host_booking_new',
      host.locale,
      {
        experienceName: host.title,
        date: waDate(startsAt, host.locale),
        time: waTime(startsAt, host.locale),
        guests: waGuests(booking.partySize, host.locale),
        payout: waMoney(payoutSar, host.locale),
        deadline: booking.approvalDeadline
          ? waDateTime(new Date(booking.approvalDeadline), host.locale)
          : waDate(startsAt, host.locale),
        bookingPath: hostBookingPath(host.locale, booking.referenceCode),
        guestsNumber: formatInteger(booking.partySize, host.locale),
        dashboardUrl: hostBookingsUrl(host.locale),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * The guest cancelled — tell the host their date has the spots back.
 * Sent for pending and confirmed bookings alike; best-effort, gated.
 */
export async function sendHostGuestCancelledEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostGuestCancelledSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostGuestCancelledIntro'),
    rows: hostRows(booking, host, t),
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_guest_cancelled',
    dedupeKey: `host_guest_cancelled:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'host_booking_cancelled',
      host.locale,
      {
        experienceName: host.title,
        date: waDate(startsAt, host.locale),
        bookingPath: hostBookingPath(host.locale, booking.referenceCode),
        time: waTime(startsAt, host.locale),
        dashboardUrl: hostBookingsUrl(host.locale),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * The guest moved their booking — tell the host the old date has its
 * spots back and the new date is now holding them. Mirrors the
 * guest-cancelled notice; best-effort, gated.
 */
export async function sendHostBookingRescheduledEmail(
  reference: string,
  oldDate: string,
): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const movedFrom = startInstant(oldDate, booking.startTime);
  const rows = [
    { label: t('movedFromLabel'), value: formatDate(movedFrom, host.locale) },
    ...hostRows(booking, host, t),
  ];
  const subject = t('hostBookingRescheduledSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostBookingRescheduledIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_booking_rescheduled',
    dedupeKey: `host_booking_rescheduled:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'host_booking_rescheduled',
      host.locale,
      {
        experienceName: host.title,
        date: waDate(startsAt, host.locale),
        time: waTime(startsAt, host.locale),
        bookingPath: hostBookingPath(host.locale, booking.referenceCode),
        dashboardUrl: hostBookingsUrl(host.locale),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * An unpaid hold lapsed and the cron released it — the booking the host
 * was told about evaporated. Without this, the host's picture of their
 * date silently diverges from reality.
 */
export async function sendHostHoldLapsedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  // Account-critical: the host's hold lapsed and their calendar changed — bypasses channel toggles.
  const host = await hostEmailContext(booking.experienceSlug, { critical: true });
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostHoldLapsedSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostHoldLapsedIntro'),
    rows: hostRows(booking, host, t),
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  // Email-only for now — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'host_hold_lapsed',
    dedupeKey: `host_hold_lapsed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject, html, text },
  });
}

/**
 * The guest's payment settled — the booking is fully secured. Closes
 * the gap where the host heard about a booking at creation (possibly
 * pre-payment) and then nothing again.
 */
export async function sendHostPaymentReceivedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    booking.totalAmountSar,
    booking.commissionBps,
    booking.vatRateBps,
    booking.discountSar,
    booking.walletAppliedSar,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const subject = t('hostPaymentReceivedSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostPaymentReceivedIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_payment_received',
    dedupeKey: `host_payment_received:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'host_booking_confirmed',
      host.locale,
      {
        experienceName: host.title,
        date: waDate(startsAt, host.locale),
        time: waTime(startsAt, host.locale),
        guests: waGuests(booking.partySize, host.locale),
        payout: waMoney(payoutSar, host.locale),
        bookingPath: hostBookingPath(host.locale, booking.referenceCode),
        dashboardUrl: hostBookingsUrl(host.locale),
      },
      { reference: booking.referenceCode },
    ),
  });
}

/**
 * An operator (admin) cancelled the booking — tell the host their date
 * has the spots back. The guest-cancel notice covers guest
 * cancellations and a host cancelling knows already; this closes the
 * admin-cancel gap where the host's calendar changed silently.
 */
export async function sendHostBookingCancelledEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostCancelledByOpsSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostCancelledByOpsIntro'),
    rows: hostRows(booking, host, t),
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_booking_cancelled',
    dedupeKey: `host_booking_cancelled:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: whatsappPayload(
      'host_booking_cancelled',
      host.locale,
      {
        experienceName: host.title,
        date: waDate(startInstant(booking.date, booking.startTime), host.locale),
        bookingPath: hostBookingPath(host.locale, booking.referenceCode),
      },
      { reference: booking.referenceCode },
    ),
  });
}
