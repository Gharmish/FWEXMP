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
 *   /<locale>/sign-in          auth surface
 *   /<locale>/host             host dashboard (signed-in hosts only)
 *   /<locale>/host/apply       private host-application workflow
 *   /<locale>/admin            internal admin tools
 *
 * The disallowed pages already carry `robots: noindex, nofollow` in
 * their generateMetadata — this is belt-and-suspenders for crawlers
 * that ignore page meta but honor robots.txt.
 */
export function GET(): Response {
  // Note: order matters — robots.txt disallow rules are prefix matches,
  // so 'host' would shadow 'host/apply'. We keep both explicit for
  // clarity even though 'host' alone would suffice.
  const privatePaths = [
    'dev',
    'me',
    'wishlist',
    'book/confirmed/',
    'sign-in',
    'host',
    'host/apply',
    'admin',
  ];
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
