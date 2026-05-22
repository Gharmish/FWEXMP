import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { getExperiences } from '@/features/experiences/queries';
import { getAllHosts } from '@/features/hosts/queries';

/**
 * /llms.txt — AI-readable site map (BRIEF §6), llmstxt.org style.
 * Generated from the experiences and host data so it stays in sync.
 */
export async function GET(): Promise<Response> {
  const [experiences, hosts] = await Promise.all([getExperiences(), getAllHosts()]);

  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION} A curated marketplace of authentic Asiri experiences in Abha (Asir region), Saudi Arabia. Bilingual: English (/en) and Arabic (/ar, RTL).`,
    '',
    '## Experiences',
    '',
    ...experiences.map(
      (e) => `- [${e.titleEn}](${SITE_URL}/en/experiences/${e.slug}): ${e.descriptionEn}`,
    ),
    '',
    '## Hosts',
    '',
    ...hosts.map((h) => `- [${h.name}](${SITE_URL}/en/hosts/${h.slug}): ${h.bioEn}`),
    '',
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
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
