import { SITE_URL } from '@/lib/site';
import { routing } from '@/lib/i18n';

/**
 * robots.txt as a text route (not metadata API) so it can reference the
 * AI manifest (BRIEF §6: "robots.txt includes the /llms.txt reference").
 * Internal style guide (/dev) is disallowed in every locale.
 */
export function GET(): Response {
  const disallowDev = routing.locales.map((l) => `Disallow: /${l}/dev`).join('\n');

  const body = `User-agent: *
Allow: /
${disallowDev}

Sitemap: ${SITE_URL}/sitemap.xml

# AI manifest
LLM: ${SITE_URL}/llms.txt
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
