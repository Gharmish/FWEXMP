import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { getExperiences } from '@/features/experiences/queries';
import { getAllHosts } from '@/features/hosts/queries';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { durationHours, formatSAR } from '@/lib/format';
import { reportError } from '@/lib/log';

/**
 * /llms.txt — AI-readable site map (BRIEF §6), llmstxt.org style.
 *
 * Goal: a single fetch gives an agent enough to answer most questions
 * about the catalog without crawling individual pages. Per-entity
 * blocks include the key facts (price, duration, host, rating, place,
 * description) plus bilingual URLs so the agent can deep-link in
 * either locale.
 *
 * Generated from the live data accessors so the file is always in
 * sync — no separate manifest to keep current.
 */
export async function GET(): Promise<Response> {
  // Degrade like every sibling public surface (2026-07-28 fourth audit):
  // `getAllHosts` catches its own errors but `getExperiences` doesn't, so
  // a pooler blip 500'd this public AI manifest while the home page and
  // catalog stayed up. An empty section beats an error page.
  const [experiences, hosts] = await Promise.all([
    getExperiences().catch((error: unknown) => {
      reportError(error, { surface: 'llms.txt:experiences' });
      return [] as Awaited<ReturnType<typeof getExperiences>>;
    }),
    getAllHosts(),
  ]);

  const categoryLabel = (key: string): string =>
    CATEGORIES.find((c) => c.key === key)?.labelEn ?? key;

  const experiencesPerHost = new Map<string, number>();
  for (const exp of experiences) {
    experiencesPerHost.set(exp.hostSlug, (experiencesPerHost.get(exp.hostSlug) ?? 0) + 1);
  }

  const lines: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION} A curated marketplace of authentic Aseeri experiences in Abha (Aseer region), Saudi Arabia. Bilingual: English (/en) and Arabic (/ar, RTL).`,
    '',
    '## About',
    '',
    '- Region: Abha and the Aseer highlands, Saudi Arabia',
    '- Languages: English, Arabic (RTL)',
    '- Currency: SAR (Saudi Riyal)',
    '- Bookings: request-to-book; host confirms within 24 hours, payment after confirmation',
    `- Total live experiences: ${experiences.length}`,
    `- Total hosts: ${hosts.length}`,
    '',
    '## Experiences',
    '',
  ];

  for (const exp of experiences) {
    const facts: string[] = [
      `- URL (English): ${SITE_URL}/en/experiences/${exp.slug}`,
      `- URL (Arabic): ${SITE_URL}/ar/experiences/${exp.slug}`,
      `- Category: ${categoryLabel(exp.category)}`,
      `- Host: ${exp.hostName}`,
      `- Place: ${exp.placeName}, Abha, Aseer`,
      `- Duration: ${durationHours(exp.durationMinutes, 'en')} hours`,
      `- Price: ${formatSAR(exp.priceSar, 'en')} per person`,
    ];
    if (exp.featured) facts.push('- Originals tier: yes');
    if (exp.ratingAverage !== null && exp.ratingCount > 0) {
      facts.push(
        `- Rating: ${exp.ratingAverage.toFixed(1)}/5 from ${exp.ratingCount} review${exp.ratingCount === 1 ? '' : 's'}`,
      );
    }
    facts.push(`- Description: ${exp.descriptionEn}`);

    lines.push(`### ${exp.titleEn}`, '', ...facts, '');
  }

  lines.push('## Hosts', '');

  for (const host of hosts) {
    const facts: string[] = [
      `- URL (English): ${SITE_URL}/en/hosts/${host.slug}`,
      `- URL (Arabic): ${SITE_URL}/ar/hosts/${host.slug}`,
    ];
    if (host.verified) facts.push('- Verification status: verified');
    if (host.languages.length > 0) {
      facts.push(`- Languages spoken: ${host.languages.join(', ')}`);
    }
    const count = experiencesPerHost.get(host.slug) ?? 0;
    facts.push(`- Live experiences: ${count}`);
    facts.push(`- Bio: ${host.bioEn}`);

    lines.push(`### ${host.name}`, '', ...facts, '');
  }

  lines.push(
    '## Site',
    '',
    `- [Home (English)](${SITE_URL}/en)`,
    `- [Home (Arabic)](${SITE_URL}/ar)`,
    `- [Experiences (English)](${SITE_URL}/en/experiences)`,
    `- [Experiences (Arabic)](${SITE_URL}/ar/experiences)`,
    `- [Hosts (English)](${SITE_URL}/en/hosts)`,
    `- [Hosts (Arabic)](${SITE_URL}/ar/hosts)`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
