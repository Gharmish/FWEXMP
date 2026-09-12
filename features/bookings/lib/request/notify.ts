import { after } from 'next/server';
import { reportError } from '@/lib/log';
import {
  sendBookingAwaitingPaymentEmail,
  sendBookingRequestReceivedEmail,
  sendHostNewBookingEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * Step 11 — tell the host and acknowledge the guest. Best-effort (a mail
 * hiccup must never fail a booking) AND after the response: each send
 * re-loads the booking + experience and makes a Resend call, which used
 * to sit between the insert and the redirect as pure user-perceived
 * latency on the single most important conversion action. `after()` runs
 * once the redirect has flushed; the function stays alive until it
 * settles.
 */
export function queueBookingEmails(reference: string): void {
  after(async () => {
    try {
      await sendHostNewBookingEmail(reference);
    } catch (error) {
      reportError(error, { surface: 'booking-request:hostEmail', reference });
    }
    // Request mode only; no-ops without an email on file.
    try {
      await sendBookingRequestReceivedEmail(reference);
    } catch (error) {
      reportError(error, { surface: 'booking-request:guestEmail', reference });
    }
    // Instant mode: "your spot is held until {deadline}" with the pay
    // link, at creation time. The sender's own guards make this a no-op
    // for request-mode bookings (no payment deadline yet), so it can be
    // called unconditionally; the ledger dedupes any replay.
    try {
      await sendBookingAwaitingPaymentEmail(reference, 'created');
    } catch (error) {
      reportError(error, { surface: 'booking-request:holdEmail', reference });
    }
  });
}
