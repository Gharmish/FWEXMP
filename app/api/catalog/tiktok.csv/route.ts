import type { NextRequest } from 'next/server';
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
 *
 * `?locale=ar` emits the Arabic titles/descriptions and `/ar/` landing
 * links (same sku_ids — one catalog, two localized feeds) so Arabic ad
 * units stop showing English cards in an Arabic-majority market. The
 * Arabic fields are already fallback-safe: the query layer substitutes
 * English wherever the Arabic column still holds the TODO(ar) scaffold.
 *
 * Rows without a hero image are SKIPPED, not emitted empty — TikTok
 * rejects an empty image_link row-by-row, which silently kept those
 * products out of the catalog anyway; skipping makes the drop explicit
 * and keeps the feed valid. Relative image paths are absolutized (the
 * detail page guards `startsWith('http')` for the same reason).
 */

export const revalidate = 3600;

function field(value: string): string {
  return `"${value.replaceAll('"', '""').replaceAll(/\s+/g, ' ').trim()}"`;
}

function absoluteImage(heroImage: string): string {
  if (heroImage.startsWith('http')) return heroImage;
  return `${SITE_URL}${heroImage.startsWith('/') ? '' : '/'}${heroImage}`;
}

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const experiences = await getExperiences();
  const header =
    'sku_id,title,description,availability,condition,price,link,image_link,brand,product_type';
  const rows = experiences
    .filter((e) => Boolean(e.heroImage))
    .map((e) =>
      [
        field(e.slug),
        field(locale === 'ar' ? e.titleAr : e.titleEn),
        field(locale === 'ar' ? e.descriptionAr : e.descriptionEn),
        // TODO(analytics): derive from live schedule capacity ("out of
        // stock" when no bookable date remains) — needs a batch
        // availability read alongside this cached loader, not a per-row
        // fan-out against the pooler.
        'in stock',
        'new',
        `${e.priceSar.toFixed(2)} SAR`,
        field(`${SITE_URL}/${locale}/experiences/${e.slug}`),
        // Non-null by the filter above; narrowing doesn't cross the
        // callback boundary, hence the fallback.
        field(absoluteImage(e.heroImage ?? '')),
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
