import { SITE_URL } from '@/lib/site';
import { routing } from '@/lib/i18n';

/**
 * robots.txt as a text route (not metadata API) so it can reference the
 * AI manifest (BRIEF §6: "robots.txt includes the /llms.txt reference").
 *
 * Disallows, by locale:
 *   /<locale>/dev              internal style guide
 *   /<locale>/me               per-guest activity page
 *   /<locale>/wishlist         per-guest cookie state, never useful to a crawler
 *   /<locale>/book/confirmed/  per-booking reference URLs (UUID-shaped)
 *
 * The wishlist + confirmation pages already carry `robots: noindex,
 * nofollow` in their generateMetadata — this is belt-and-suspenders
 * for crawlers that ignore page meta but honor robots.txt.
 */
export function GET(): Response {
  const privatePaths = ['dev', 'me', 'wishlist', 'book/confirmed/'];
  const disallows = routing.locales
    .flatMap((l) => privatePaths.map((p) => `Disallow: /${l}/${p}`))
    .join('\n');

  const body = `User-agent: *
Allow: /
${disallows}

Sitemap: ${SITE_URL}/sitemap.xml

# AI manifest
LLM: ${SITE_URL}/llms.txt
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
