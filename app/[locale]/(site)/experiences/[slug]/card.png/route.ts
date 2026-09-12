import type { NextRequest } from 'next/server';
import OgImage from '../opengraph-image';

/**
 * Extension-suffixed alias for the experience OG card. WhatsApp media
 * (via Twilio) validates media URLs by their FILE EXTENSION, not the
 * served Content-Type, so `/opengraph-image` — a perfectly good PNG —
 * is rejected as a template media header. This route serves the exact
 * same ImageResponse at a `.png` path the validator accepts; the
 * notification senders use it as the media variable.
 *
 * CACHED, deliberately (2026-08-01 ninth audit). Unlike the
 * `opengraph-image` metadata convention, a plain Route Handler gets no
 * static-metadata caching, and `ImageResponse` sets
 * `max-age=0, must-revalidate` itself — so every hit re-read four TTFs
 * off disk and re-encoded a 1200x630 PNG. The path also bypasses the
 * proxy (its matcher excludes anything containing a dot), and a
 * non-live slug renders a branded fallback at 200 rather than 404ing,
 * so slug enumeration never short-circuits. That combination is a
 * straightforward CPU/cost amplifier on a public URL. The card only
 * changes when the listing does, so a day of ISR plus an explicit
 * long CDN cache is both safe and sufficient.
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
