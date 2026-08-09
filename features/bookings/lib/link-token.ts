import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n';

/**
 * Booking link token — the third proof of ownership, for the links WE
 * send (2026-08-09).
 *
 * The access model (see `bookingViewerCanAccess`) accepts a signed-in
 * owner or this browser's last-booking cookie. A guest who opens the
 * receipt link we WhatsApped them has neither: WhatsApp renders links in
 * its own in-app browser with a separate cookie jar, so even the phone
 * that made the booking fails the cookie check. The phone-only guest has
 * no account and no emailed PDF either, so that link is their only path
 * to their own tax document — and it dead-ended on a sign-in wall.
 *
 * A token fixes it without reopening the hole the 2026-08-02 security
 * audit closed. A bare reference still authorizes nothing; what
 * authorizes is a tag only this server can compute, which we attach only
 * to links addressed to the guest's own phone or inbox.
 *
 * Scope is deliberately narrow:
 *
 *  - ONE booking. The tag covers the reference, so a token cannot be
 *    re-pointed at another booking.
 *  - READ only. Cancel, reschedule, refund and review still go through
 *    `bookingViewerCanAccess`, which never looks at the token — money
 *    and state changes keep requiring the cookie or a signed-in account.
 *  - No expiry. A tax invoice is a keepable document the guest may open
 *    months later, and an expired receipt link is the same dead end this
 *    fixes. The blast radius of a leaked token is one booking's details,
 *    which is what the 90-day cookie already grants.
 */

/** Domain separation — a key derived here is useless for any other purpose. */
const KEY_LABEL = 'gharmish:booking-link-token:v1';

/** Truncated to 27 base64url chars (~160 bits), matching the cookie tag. */
const TAG_LENGTH = 27;

/** Query parameter carrying the token on booking and invoice URLs. */
export const BOOKING_LINK_TOKEN_PARAM = 'k';

/**
 * HMAC key for the tag.
 *
 * Same derivation as the last-booking cookie: an explicit
 * `COOKIE_SIGNING_SECRET` if set, otherwise the service-role key, which
 * is always present in production — so this needs no new configuration.
 *
 * FAIL CLOSED in production: with no secret there is no key, so
 * {@link bookingLinkTokenValid} rejects every token and access falls
 * back to the cookie or a signed-in account. Outside production a fixed
 * dev key keeps the flow testable with nothing configured.
 */
function signingKey(): Buffer | null {
  const base = serverEnv.COOKIE_SIGNING_SECRET || serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (base) return createHmac('sha256', base).update(KEY_LABEL).digest();
  if (serverEnv.NODE_ENV !== 'production') {
    return createHmac('sha256', 'gharmish-dev-only-cookie-key').update(KEY_LABEL).digest();
  }
  return null;
}

/**
 * The token for a booking reference, or null when no key is configured
 * (production misconfiguration). Callers building outbound links must
 * treat null as "send the link without a token" — it degrades to the
 * sign-in wall rather than to a broken URL.
 */
export function bookingLinkToken(reference: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac('sha256', key).update(reference).digest('base64url').slice(0, TAG_LENGTH);
}

/**
 * Whether `token` is the tag this server would mint for `reference`.
 * Constant-time, and false for every input when no key is configured.
 */
export function bookingLinkTokenValid(
  reference: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = bookingLinkToken(reference);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `?k=<token>`, or '' when no key is configured. */
function tokenQuery(reference: string): string {
  const token = bookingLinkToken(reference);
  return token ? `?${BOOKING_LINK_TOKEN_PARAM}=${token}` : '';
}

/**
 * Absolute URL to the booking's manage/confirmation page, carrying the
 * token. Use for every link we send the guest (email, WhatsApp, .ics
 * bodies); in-app navigation uses relative hrefs and the cookie.
 */
export function bookingManageUrl(locale: Locale, reference: string): string {
  return `${SITE_URL}/${locale}/book/confirmed/${reference}${tokenQuery(reference)}`;
}

/** Absolute URL to the booking's receipt / tax invoice, carrying the token. */
export function bookingInvoiceUrl(locale: Locale, reference: string): string {
  return `${SITE_URL}/${locale}/book/confirmed/${reference}/invoice${tokenQuery(reference)}`;
}
