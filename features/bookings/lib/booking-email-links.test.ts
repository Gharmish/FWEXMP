import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `guestBookingUrls()` is the ONE builder of guest-facing URLs for the
 * email senders. It exists because the 2026-08 marketing-remediation
 * commit silently replaced every tokened link in booking-email.ts with
 * bare `${SITE_URL}/${locale}/book/...` interpolations — and a bare
 * booking URL dead-ends on the sign-in wall for exactly the browsers
 * emails open in (WhatsApp in-app jar, second device, any guest whose
 * cookie holds a newer booking). P0-1, HOMEPAGE_BOOKING_AUDIT.md.
 *
 * These tests pin the two properties a future edit must not drop:
 * every URL the helper emits carries a VALID `?k=` token, and the
 * sender source contains zero bare SITE_URL-interpolated /book/ links.
 */

// link-token.ts derives its HMAC key from COOKIE_SIGNING_SECRET (falling
// back to SUPABASE_SERVICE_ROLE_KEY, then a fixed dev key outside
// production). Set it BEFORE the dynamic imports — lib/env.ts snapshots
// process.env at module load.
process.env.COOKIE_SIGNING_SECRET = 'booking-email-links-test-secret';

const { guestBookingUrls } = await import('./booking-email-links');
const { BOOKING_LINK_TOKEN_PARAM, bookingLinkTokenValid } = await import('./link-token');

const REFERENCE = '550e8400-e29b-41d4-a716-446655440000';
const SLUG = 'juniper-forest-dawn-walk';

describe('guestBookingUrls', () => {
  it('carries a valid token on EVERY url it emits', () => {
    for (const locale of ['en', 'ar'] as const) {
      const urls = guestBookingUrls(locale, REFERENCE, SLUG);
      for (const [name, href] of Object.entries(urls)) {
        const token = new URL(href).searchParams.get(BOOKING_LINK_TOKEN_PARAM);
        expect(token, `${name} (${locale}) must carry ?k=`).toBeTruthy();
        expect(bookingLinkTokenValid(REFERENCE, token), `${name} (${locale}) token invalid`).toBe(
          true,
        );
      }
    }
  });

  it('points each url at its page', () => {
    const urls = guestBookingUrls('en', REFERENCE, SLUG);
    expect(new URL(urls.manage).pathname).toBe(`/en/book/confirmed/${REFERENCE}`);
    expect(new URL(urls.invoice).pathname).toBe(`/en/book/confirmed/${REFERENCE}/invoice`);
    expect(new URL(urls.pay).pathname).toBe(`/en/book/${REFERENCE}/pay`);
    expect(new URL(urls.pay).searchParams.get('slug')).toBe(SLUG);
  });

  it('puts the #review fragment AFTER the token query', () => {
    const review = new URL(guestBookingUrls('ar', REFERENCE, SLUG).review);
    expect(review.hash).toBe('#review');
    expect(
      bookingLinkTokenValid(REFERENCE, review.searchParams.get(BOOKING_LINK_TOKEN_PARAM)),
    ).toBe(true);
    // A `#review?k=` composition would bury the token in the fragment.
    expect(review.hash).not.toContain(BOOKING_LINK_TOKEN_PARAM + '=');
  });
});

describe('booking-email.ts source', () => {
  const source = readFileSync(new URL('./booking-email.ts', import.meta.url), 'utf8');

  it('contains zero bare SITE_URL-interpolated /book/ links', () => {
    // The exact shape of the P0-1 regression. `/experiences/` and host
    // dashboard links are public/cookie surfaces and may stay bare.
    expect(source).not.toContain('${SITE_URL}/${locale}/book');
    expect(source).not.toContain('${SITE_URL}/${host.locale}/book');
  });

  it('builds guest urls through the tokened helper', () => {
    expect(source).toContain("from './booking-email-links'");
    expect(source).toContain('guestBookingUrls(');
  });
});

describe('dispute-email.ts source', () => {
  // The dispute emails carry the same P0-1 exposure — a bare booking URL
  // (or one keyed by the GH- referenceCode, which the confirmed page 404s)
  // dead-ends the guest. They build the CTA inline via bookingManageUrl
  // rather than guestBookingUrls, so pin the same two properties here.
  const source = readFileSync(
    new URL('../../disputes/lib/dispute-email.ts', import.meta.url),
    'utf8',
  );

  it('contains zero bare SITE_URL-interpolated /book/ links', () => {
    expect(source).not.toContain('${SITE_URL}/${locale}/book');
  });

  it('routes its guest booking CTAs through the tokened helper, keyed by idempotencyKey', () => {
    expect(source).toContain('bookingManageUrl(');
    // The confirmed page's [ref] is the idempotencyKey UUID; keying a link
    // by the GH- referenceCode 404s.
    expect(source).not.toContain('confirmed/${dispute.booking.referenceCode}');
  });
});
