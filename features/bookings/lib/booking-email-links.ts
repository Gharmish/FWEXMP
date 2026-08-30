import 'server-only';

import type { Locale } from '@/lib/i18n';
import { bookingInvoiceUrl, bookingManageUrl, bookingPayUrl } from './link-token';

/**
 * Every guest-facing URL an email may carry, in one place — ALL of them
 * tokened (2026-08-28 P0-1). Notification links open in browsers with no
 * last-booking cookie (WhatsApp in-app jar, second device, any guest
 * with 2+ bookings), so a bare `/book/...` URL dead-ends on the sign-in
 * wall; the `?k=` tag from link-token.ts is what admits them. Email
 * senders MUST build guest URLs through this helper, never by
 * interpolating SITE_URL — booking-email-links.test.ts greps the sender
 * source to pin that.
 */
export interface GuestBookingUrls {
  /** Booking manage/confirmation page. */
  manage: string;
  /** Receipt / tax invoice / credit note. */
  invoice: string;
  /** Checkout for an approved or still-unpaid booking. */
  pay: string;
  /** Review composer anchor on the booking page. */
  review: string;
}

export function guestBookingUrls(
  locale: Locale,
  reference: string,
  slug: string,
): GuestBookingUrls {
  const manage = bookingManageUrl(locale, reference);
  return {
    manage,
    invoice: bookingInvoiceUrl(locale, reference),
    pay: bookingPayUrl(locale, reference, slug),
    // Fragment AFTER the token query (`…?k=…#review`) — appending is
    // correct whether or not the manage URL carries a query.
    review: `${manage}#review`,
  };
}
