/**
 * Where the consent-gated trackers (Snap Pixel, TikTok Pixel, GA4) may
 * load at all.
 *
 * Every booking link we send a guest carries the permanent `?k=` link
 * token (`lib/booking-link-token.ts`), the post-3DS return adds it to the
 * confirmation URL, and "Change date or guests" carries the same token to
 * the listing URL as `supersedesToken`. All three vendor SDKs read
 * `location.href` themselves for every page view, so a token in the
 * address bar landed in three third-party stores — and that token is a
 * read of the booking plus the pay-in actions behind
 * `checkoutViewerCanAccess`, for anyone with property access
 * (2026-10-24, #190). `Referrer-Policy` and the Sentry scrub
 * (`lib/sentry-scrub.ts`) cover the Referer header and Sentry only;
 * nothing can scrub what a script reads from the URL itself.
 *
 * So: no tracker on any `/[locale]/book/*` route (the only routes that
 * ever carry `k`, and whose path holds the booking UUID), and none on a
 * URL that carries a capability parameter, wherever it is. The purchase
 * conversion on the confirmation page is still reported server-side
 * (`lib/analytics/server-events.ts`, same event id).
 */

/** Query parameters that grant access to a booking. */
const CAPABILITY_PARAMS = ['k', 'supersedesToken'] as const;

/** The route root after the locale prefix (`/ar/book/…` → `book`). */
function routeRoot(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean);
  // `localePrefix: 'always'` puts the locale first on every app route;
  // tolerate a bare path so the guard never depends on that.
  const start = segments[0] !== undefined && /^[a-z]{2}$/.test(segments[0]) ? 1 : 0;
  return segments[start];
}

/**
 * May the marketing pixels mount (and track a page view) at this URL?
 * `search` is the query string or its parsed form (`useSearchParams`).
 */
export function marketingPixelsAllowed(
  pathname: string,
  search: string | Pick<URLSearchParams, 'has'>,
): boolean {
  if (routeRoot(pathname) === 'book') return false;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return !CAPABILITY_PARAMS.some((name) => params.has(name));
}
