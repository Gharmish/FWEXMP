'use server';

import { z } from 'zod';
import { reportError } from '@/lib/log';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import {
  embedUrlFor,
  geocodeCandidates,
  isMapsUrl,
  readEmbedPosition,
  readPlaceClue,
  toHttps,
  unwrapConsent,
  type PlaceClue,
} from '@/features/host-experiences/lib/map-link';
import {
  decodePlusCode,
  isFullPlusCode,
  type LatLng,
} from '@/features/host-experiences/lib/plus-code';

/**
 * Turn a pasted maps share link into coordinates for the meeting-point
 * picker. Share links from the Google Maps app (`maps.app.goo.gl/…`)
 * are opaque short links: the place only appears in the URL they
 * redirect to, and a browser cannot read that redirect across origins,
 * so the lookup has to happen here.
 *
 * The redirect target is followed by hand, one hop at a time, and every
 * hop must be a Google or Apple maps hostname (`isMapsUrl`) — the
 * action never requests a host the caller chose freely. The only
 * response body it reads is Google's own embed page for the place, at a
 * URL this module builds itself (`embedUrlFor`), because the Maps app's
 * share links now redirect to a place *name* rather than a position and
 * that page is where Google states the position.
 */
export type ResolveMapLinkState =
  | {
      success: true;
      lat: number;
      lng: number;
      /** True when the pin came from a place name, not an exact position. */
      approximate: boolean;
    }
  | { success: false; message: 'forbidden' | 'invalid' | 'not_found' | 'server' };

const inputSchema = z.string().trim().min(1).max(2048);

const MAX_HOPS = 4;
const MAX_GEOCODE_TRIES = 3;
const REQUEST_TIMEOUT_MS = 5000;
/** The embed page is ~2 KB; anything far larger is not the page we expect. */
const EMBED_MAX_BYTES = 256 * 1024;
const USER_AGENT = 'Gharmish/1.0 (+https://gharmish.com; hello@gharmish.com)';
/** Launch market — the reference of last resort for a shortened plus code. */
const ABHA_CENTRE: LatLng = { lat: 18.2164, lng: 42.5053 };

/** Where the URL redirects to, or null when it does not redirect. */
async function nextHop(url: string): Promise<string | null> {
  const response = await fetch(url, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'en' },
  });
  await response.body?.cancel();
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers.get('location');
  if (!location) return null;
  return new URL(location, url).toString();
}

/**
 * The place's position from Google's embed page, or null when Google
 * matched nothing. A failure of this lookup must not fail the whole
 * resolution — the geocoder still gets its turn.
 */
async function embedPosition(clue: Extract<PlaceClue, { kind: 'text' }>): Promise<LatLng | null> {
  try {
    let url = embedUrlFor(clue);
    // Google answers the embed URL with a redirect to its canonical form;
    // it is followed by hand so that every hop stays on the allow-list.
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      if (!isMapsUrl(url)) return null;
      const response = await fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'en' },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        const next = location ? toHttps(new URL(location, url).toString()) : null;
        if (!next) return null;
        url = next;
        continue;
      }
      const length = Number(response.headers.get('content-length') ?? 0);
      if (!response.ok || length > EMBED_MAX_BYTES) {
        await response.body?.cancel();
        return null;
      }
      const html = await response.text();
      return readEmbedPosition(html.slice(0, EMBED_MAX_BYTES));
    }
    return null;
  } catch {
    return null;
  }
}

interface NominatimResult {
  lat: string;
  lon: string;
}

/** First Saudi match for any of the phrases, through OpenStreetMap's geocoder. */
async function geocode(phrases: string[]): Promise<LatLng | null> {
  for (const phrase of phrases.slice(0, MAX_GEOCODE_TRIES)) {
    const params = new URLSearchParams({
      q: phrase,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'sa',
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT },
      },
    );
    if (!response.ok) continue;
    const results = (await response.json()) as NominatimResult[];
    const lat = Number(results[0]?.lat);
    const lng = Number(results[0]?.lon);
    if (results[0] && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

/** The geocoder is a convenience; its outage must not fail the lookup. */
async function geocodeQuietly(phrases: string[]): Promise<LatLng | null> {
  try {
    return await geocode(phrases);
  } catch {
    return null;
  }
}

async function settle(clue: PlaceClue): Promise<ResolveMapLinkState> {
  if (clue.kind === 'coords') {
    return { success: true, lat: clue.lat, lng: clue.lng, approximate: false };
  }

  if (clue.kind === 'plusCode') {
    if (isFullPlusCode(clue.code)) {
      const point = decodePlusCode(clue.code);
      if (!point) return { success: false, message: 'not_found' };
      return { success: true, ...point, approximate: false };
    }
    // A shortened code is exact once anchored near the right town, so
    // the town (the last part of the text) is tried before the full
    // place name, which the geocoder rarely knows.
    const [whole, ...parts] = geocodeCandidates(clue.locality);
    const anchor = whole ? await geocodeQuietly([...parts, whole]) : null;
    const point = decodePlusCode(clue.code, anchor ?? ABHA_CENTRE);
    if (!point) return { success: false, message: 'not_found' };
    return { success: true, ...point, approximate: anchor === null };
  }

  // Google's own answer first: exact when the link named the place by
  // id, its best guess for the text otherwise. The geocoder is the
  // fallback for when Google matched nothing.
  const placed = await embedPosition(clue);
  if (placed) return { success: true, ...placed, approximate: clue.ftid === null };

  const point = await geocodeQuietly(geocodeCandidates(clue.query).slice(0, 1));
  if (!point) return { success: false, message: 'not_found' };
  return { success: true, ...point, approximate: true };
}

export async function resolveMapLink(raw: string): Promise<ResolveMapLinkState> {
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId) return { success: false, message: 'forbidden' };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success || !isMapsUrl(parsed.data)) return { success: false, message: 'invalid' };
  const start = toHttps(parsed.data);
  if (!start) return { success: false, message: 'invalid' };

  try {
    let current = start;
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      current = unwrapConsent(current);
      const clue = readPlaceClue(current);
      // A long link has said all it will say; only opaque links are followed.
      if (clue) return await settle(clue);
      if (hop === MAX_HOPS || !isMapsUrl(current)) break;
      const next = await nextHop(current);
      // A redirect may point at plain http; it is only ever requested over https.
      const secure = next ? toHttps(next) : null;
      if (!secure) break;
      current = secure;
    }
    return { success: false, message: 'not_found' };
  } catch (error) {
    reportError(error, { surface: 'host-experiences:resolveMapLink' });
    return { success: false, message: 'server' };
  }
}
