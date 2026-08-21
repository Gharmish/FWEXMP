import type { Locale } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';
import { BOOKING_LINK_TOKEN_PARAM, bookingLinkToken } from '@/features/bookings/lib/link-token';

/**
 * Deep links for WhatsApp buttons. Every function returns the PATH
 * after `https://gharmish.com/` — the approved templates carry a URL
 * button `https://gharmish.com/{{n}}`, so the same template serves both
 * locales and every page. `absolute()` is for previews/logs.
 *
 * Rules (plan §7/§27): locale-prefixed, no query noise beyond the
 * booking token (the token IS the guest's access proof — without it the
 * page shows a preview state), no admin or gateway URLs.
 */

export const BASE_URL = SITE_URL;

export function absolute(suffix: string): string {
  return `${BASE_URL}/${suffix}`;
}

function tokenQuery(reference: string): string {
  const token = bookingLinkToken(reference);
  return token ? `?${BOOKING_LINK_TOKEN_PARAM}=${token}` : '';
}

/** Guest booking page (manage, cancel, reschedule, meeting point). */
export function guestBookingPath(locale: Locale, reference: string): string {
  return `${locale}/book/confirmed/${reference}${tokenQuery(reference)}`;
}

/** Receipt / tax invoice for a paid booking. */
export function guestInvoicePath(locale: Locale, reference: string): string {
  return `${locale}/book/confirmed/${reference}/invoice${tokenQuery(reference)}`;
}

/** Review form anchor on the booking page (after completion). */
export function guestReviewPath(locale: Locale, reference: string): string {
  return `${locale}/book/confirmed/${reference}${tokenQuery(reference)}#review`;
}

/** Pay-after-approval / finish-payment checkout. */
export function guestPayPath(locale: Locale, reference: string, slug: string): string {
  const token = bookingLinkToken(reference);
  const q = new URLSearchParams({ slug });
  if (token) q.set(BOOKING_LINK_TOKEN_PARAM, token);
  return `${locale}/book/${reference}/pay?${q.toString()}`;
}

export function experiencePath(locale: Locale, slug: string): string {
  return `${locale}/experiences/${slug}`;
}

export function discoverPath(locale: Locale): string {
  return `${locale}/experiences`;
}

/** Host booking deep link — `/host/bookings/[ref]` redirects into the filtered list. */
export function hostBookingPath(locale: Locale, referenceCode: string): string {
  return `${locale}/host/bookings/${referenceCode}`;
}

export function hostBookingsPath(locale: Locale): string {
  return `${locale}/host/bookings`;
}

export function hostEarningsPath(locale: Locale): string {
  return `${locale}/host/earnings`;
}

export function hostReviewsPath(locale: Locale): string {
  return `${locale}/host/reviews`;
}

export function hostExperiencePath(locale: Locale, experienceId: string): string {
  return `${locale}/host/experiences/${experienceId}`;
}

export function hostNewExperiencePath(locale: Locale): string {
  return `${locale}/host/experiences/new`;
}

export function hostDashboardPath(locale: Locale): string {
  return `${locale}/host`;
}

export function adminSupportPath(conversationId?: string | null): string {
  return conversationId ? `en/admin/support/${conversationId}` : 'en/admin/support';
}

export function adminPath(): string {
  return 'en/admin';
}

/** Google Maps directions to a coordinate (not a gharmish.com path — used as text only). */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
