import { describe, expect, it } from 'vitest';
import { OFF_SCOPE, marketingPixelsAllowed, pageViewStep } from './marketing-pixel-scope';

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
    // The same-device edit carries the bare reference only: the UUID the
    // `/book/*` ban exists to keep out of the vendors' stores.
    expect(
      marketingPixelsAllowed('/en/experiences/soudah-sunrise', '?date=2026-11-01&supersedes=abc'),
    ).toBe(false);
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

describe('pageViewStep', () => {
  it('records the first allowed page without firing: the base snippets cover it', () => {
    expect(pageViewStep(null, true, '/en/experiences')).toEqual({
      tracked: '/en/experiences',
      fire: false,
    });
  });

  it('fires for a new pathname and stays quiet for the same one', () => {
    expect(pageViewStep('/en/experiences', true, '/en/experiences/x')).toEqual({
      tracked: '/en/experiences/x',
      fire: true,
    });
    expect(pageViewStep('/en/experiences', true, '/en/experiences')).toEqual({
      tracked: '/en/experiences',
      fire: false,
    });
  });

  it('cold load on a booking route, then a public page: records only, no double view', () => {
    // /ar/book/<uuid>/pay?k=… hard load — nothing tracked, nothing loaded.
    const step1 = pageViewStep(null, false, '/ar/book/uuid/pay');
    expect(step1).toEqual({ tracked: null, fire: false });
    // Header link to the catalog: the base snippets mount and fire.
    expect(pageViewStep(step1.tracked, true, '/ar/experiences')).toEqual({
      tracked: '/ar/experiences',
      fire: false,
    });
  });

  it('public page, booking route, back to the same public page: fires once', () => {
    const live = pageViewStep(null, true, '/en/experiences/x');
    const off = pageViewStep(live.tracked, false, '/en/book/uuid/pay');
    expect(off).toEqual({ tracked: OFF_SCOPE, fire: false });
    // The scripts are still in the window and next/script will not re-run
    // the snippets, so this view must come from the effect.
    expect(pageViewStep(off.tracked, true, '/en/experiences/x')).toEqual({
      tracked: '/en/experiences/x',
      fire: true,
    });
  });

  it('consent given on a booking route leaves the slate clean', () => {
    expect(pageViewStep(null, false, '/en/book/uuid/pay')).toEqual({ tracked: null, fire: false });
  });
});
