import { getExperiences } from '@/features/experiences/queries';
import { SITE_URL } from '@/lib/site';

/**
 * TikTok catalog data feed — the scheduled-fetch source for the
 * "Gharmish experiences" catalog in TikTok Catalog Manager, so the
 * catalog tracks the live experience set automatically (new listings
 * appear, price edits propagate, unlisted experiences drop out).
 *
 * Column set = TikTok's standard e-commerce template. `sku_id` is the
 * experience slug ON PURPOSE: it must equal the `content_id` the pixel
 * sends (see `lib/funnel-tracking.ts`) for product-to-event matching.
 * Public by design — TikTok's fetcher is anonymous. Reads go through
 * the same cached, deadline-bounded loader as the public catalog pages.
 */

export const revalidate = 3600;

function field(value: string): string {
  return `"${value.replaceAll('"', '""').replaceAll(/\s+/g, ' ').trim()}"`;
}

export async function GET() {
  const experiences = await getExperiences();
  const header =
    'sku_id,title,description,availability,condition,price,link,image_link,brand,product_type';
  const rows = experiences.map((e) =>
    [
      field(e.slug),
      field(e.titleEn),
      field(e.descriptionEn),
      'in stock',
      'new',
      `${e.priceSar.toFixed(2)} SAR`,
      field(`${SITE_URL}/en/experiences/${e.slug}`),
      field(e.heroImage ?? ''),
      'Gharmish',
      field(`Experiences > ${e.category.replaceAll('_', ' ')}`),
    ].join(','),
  );
  return new Response([header, ...rows].join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
