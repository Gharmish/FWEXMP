import 'server-only';

import type { Locale } from '@/lib/i18n';

import { sendBookingReceiptEmail } from './booking-email-receipt';
import {
  sendBookingRequestReceivedEmail,
  sendBookingApprovedEmail,
  sendBookingAwaitingPaymentEmail,
  sendBookingDeclinedEmail,
  sendBookingExpiredEmail,
  sendBookingPaymentLapsedEmail,
  sendBookingOnHoldEmail,
  sendBookingCompletedEmails,
  sendBookingPaymentFailedEmail,
} from './booking-email-guest';
import {
  sendBookingPrepareReminderEmail,
  sendBookingDepartureReminderEmail,
} from './booking-email-reminders';
import {
  sendHostNewBookingEmail,
  sendHostGuestCancelledEmail,
  sendHostHoldLapsedEmail,
  sendHostPaymentReceivedEmail,
} from './booking-email-host';

export { sendBookingReceiptEmail } from './booking-email-receipt';
export {
  sendBookingCancellationEmail,
  sendBookingRescheduledEmail,
  sendBookingRequestReceivedEmail,
  sendBookingApprovedEmail,
  sendBookingAwaitingPaymentEmail,
  sendBookingDeclinedEmail,
  sendBookingExpiredEmail,
  sendBookingPaymentLapsedEmail,
  sendBookingOnHoldEmail,
  sendBookingCompletedEmails,
  sendBookingPaymentFailedEmail,
} from './booking-email-guest';
export {
  sendBookingPrepareReminderEmail,
  sendBookingDepartureReminderEmail,
} from './booking-email-reminders';
export {
  sendHostNewBookingEmail,
  sendHostGuestCancelledEmail,
  sendHostBookingRescheduledEmail,
  sendHostHoldLapsedEmail,
  sendHostPaymentReceivedEmail,
  sendHostBookingCancelledEmail,
} from './booking-email-host';

/**
 * Booking email + WhatsApp senders. The senders live in five sibling
 * modules by lifecycle (2026-09 engineering audit ARCH-07); this index is
 * the import surface — and the module test suites mock — so nothing
 * outside this folder changed.
 */

/**
 * Booking notifications the cron retry sweep can safely re-fire from
 * (reference, locale) alone: each sender re-renders from current DB
 * state and re-dispatches, and `claimDelivery` re-claims only channel
 * rows still `failed` with attempts left — so re-calling a sender can
 * never double-send anything that already went out.
 *
 * Deliberately absent: `booking_cancelled`, `booking_rescheduled`,
 * `host_booking_rescheduled` (payloads need caller context — the refund
 * verdict, the pre-reschedule date — that isn't re-derivable from the
 * booking row) and `host_booking_cancelled` (the operator-vs-guest
 * provenance isn't re-derivable here either), so a failed one stays
 * failed and surfaces in the ledger instead of guessing.
 */
export const RETRYABLE_BOOKING_SENDERS: Readonly<
  Record<string, (reference: string, locale: Locale) => Promise<void>>
> = {
  booking_confirmed: (reference) => sendBookingReceiptEmail(reference),
  booking_request_received: (reference) => sendBookingRequestReceivedEmail(reference),
  booking_approved: (reference) => sendBookingApprovedEmail(reference),
  booking_awaiting_payment: (reference) => sendBookingAwaitingPaymentEmail(reference, 'created'),
  booking_payment_reminder: (reference) => sendBookingAwaitingPaymentEmail(reference, 'reminder'),
  booking_declined: (reference) => sendBookingDeclinedEmail(reference),
  booking_expired: (reference) => sendBookingExpiredEmail(reference),
  booking_payment_lapsed: (reference) => sendBookingPaymentLapsedEmail(reference),
  booking_on_hold: (reference) => sendBookingOnHoldEmail(reference),
  booking_payment_failed: (reference) => sendBookingPaymentFailedEmail(reference),
  booking_reminder_24h: (reference, locale) => sendBookingPrepareReminderEmail(reference, locale),
  booking_reminder_3h: (reference, locale) => sendBookingDepartureReminderEmail(reference, locale),
  booking_completed_review: (reference) => sendBookingCompletedEmails(reference),
  host_booking_completed: (reference) => sendBookingCompletedEmails(reference),
  host_new_booking: (reference) => sendHostNewBookingEmail(reference),
  host_new_request: (reference) => sendHostNewBookingEmail(reference),
  host_guest_cancelled: (reference) => sendHostGuestCancelledEmail(reference),
  host_hold_lapsed: (reference) => sendHostHoldLapsedEmail(reference),
  host_payment_received: (reference) => sendHostPaymentReceivedEmail(reference),
};
