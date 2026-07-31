import type { NextRequest } from 'next/server';
import OgImage from '../opengraph-image';

/**
 * Extension-suffixed alias for the experience OG card. WhatsApp media
 * (via Twilio) validates media URLs by their FILE EXTENSION, not the
 * served Content-Type, so `/opengraph-image` — a perfectly good PNG —
 * is rejected as a template media header. This route serves the exact
 * same ImageResponse at a `.png` path the validator accepts; the
 * notification senders use it as the media variable.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ locale: string; slug: string }> },
): Promise<Response> {
  return OgImage({ params: ctx.params });
}
