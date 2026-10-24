import { describe, expect, it } from 'vitest';
import { marketingPixelsAllowed } from './marketing-pixel-scope';

/**
 * #190: the `?k=` booking token, the booking UUID and `supersedesToken`
 * were sent to GA4, TikTok and Snap in the page URL. The pixels must not
 * mount on any booking route or on a URL carrying a capability parameter.
 */
describe('marketingPixelsAllowed', () => {
  it('refuses every booking route, token or not', () => {
    const uuid = '0f3b2a6c-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
    expect(marketingPixelsAllowed(`/ar/book/${uuid}/pay`, '?slug=x&k=tok')).toBe(false);
    expect(marketingPixelsAllowed(`/ar/book/${uuid}/pay`, '?slug=x')).toBe(false);
    expect(marketingPixelsAllowed(`/en/book/confirmed/${uuid}`, '?k=tok&payment=success')).toBe(
      false,
    );
    expect(marketingPixelsAllowed(`/en/book/confirmed/${uuid}`, '')).toBe(false);
    expect(marketingPixelsAllowed(`/en/book/confirmed/${uuid}/invoice`, '?k=tok')).toBe(false);
    // Without the locale prefix too — the guard must not depend on it.
    expect(marketingPixelsAllowed(`/book/${uuid}/pay`, '')).toBe(false);
  });

  it('refuses a URL that carries a capability parameter anywhere', () => {
    expect(
      marketingPixelsAllowed(
        '/en/experiences/soudah-sunrise',
        '?date=2026-11-01&party=2&supersedes=abc&supersedesToken=tok',
      ),
    ).toBe(false);
    expect(marketingPixelsAllowed('/ar/experiences/soudah-sunrise', '?k=tok')).toBe(false);
    // An empty token still names the parameter: keep it out.
    expect(marketingPixelsAllowed('/en/experiences/soudah-sunrise', '?supersedesToken=')).toBe(
      false,
    );
  });

  it('accepts the parsed form the client reads from useSearchParams', () => {
    expect(
      marketingPixelsAllowed('/en/experiences/x', new URLSearchParams('supersedesToken=tok')),
    ).toBe(false);
    expect(
      marketingPixelsAllowed('/en/experiences/x', new URLSearchParams('date=2026-11-01')),
    ).toBe(true);
  });

  it('allows the public routes, with ordinary query strings', () => {
    expect(marketingPixelsAllowed('/en/experiences', '')).toBe(true);
    expect(marketingPixelsAllowed('/ar/experiences', '?category=nature&originals=1')).toBe(true);
    expect(
      marketingPixelsAllowed('/en/experiences/soudah-sunrise', '?date=2026-11-01&party=2'),
    ).toBe(true);
    expect(marketingPixelsAllowed('/ar', '')).toBe(true);
    expect(marketingPixelsAllowed('/en/hosts/abha-walks', '?utm_source=tiktok')).toBe(true);
    // Only the route root counts: a bookings list is not a booking route,
    // and a listing slug that merely contains "book" stays tracked.
    expect(marketingPixelsAllowed('/en/host/bookings', '')).toBe(true);
    expect(marketingPixelsAllowed('/en/experiences/bookbinding-workshop', '')).toBe(true);
  });
});
