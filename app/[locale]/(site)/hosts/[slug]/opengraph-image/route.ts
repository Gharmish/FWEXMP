import type { NextRequest } from 'next/server';
import OgImage from '../og-card';

/**
 * The host card at its historical URL (third-round verification N1).
 * Next's `opengraph-image.tsx` convention appends a hash suffix to the
 * route once the parent path sits inside a route group, so the (site)
 * move would have changed every already-shared host-profile preview to a
 * 404. A plain Route Handler keeps `/{locale}/hosts/{slug}/opengraph-image`
 * stable; the page points og:image at it explicitly. Cached exactly like
 * the experience card (see experiences/[slug]/card.png/route.ts).
 */
export const revalidate = 86400;

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ locale: string; slug: string }> },
): Promise<Response> {
  const image = await OgImage({ params: ctx.params });
  const headers = new Headers(image.headers);
  headers.set(
    'cache-control',
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  );
  return new Response(image.body, { status: image.status, headers });
}
