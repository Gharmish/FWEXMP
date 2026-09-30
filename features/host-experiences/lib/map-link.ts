import { parsePastedCoords } from '@/features/host-experiences/lib/coords';

/**
 * Reading a maps share link, pure half. The server action
 * (`map-link-actions.ts`) follows the redirects; everything here decides
 * what may be followed and what a URL says about the place, so the
 * rules are unit-testable without a network.
 */

/**
 * Every hostname the resolver may request, spelled out. A pattern such
 * as "google.<any country>" would be shorter but would trust whoever
 * registered the name in each country, and a hostname we request can
 * resolve to any address its owner likes.
 */
const MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.com.sa',
  'www.google.com.sa',
  'maps.google.com.sa',
  'maps.apple.com',
  'maps.apple',
]);
const CONSENT_HOST = 'consent.google.com';

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Whether the server may request this URL. The allow-list is the whole
 * defence against the resolver being aimed at an arbitrary host: only
 * Google and Apple maps hostnames, never an IP or a port.
 */
export function isMapsUrl(raw: string): boolean {
  const url = parseUrl(raw);
  if (!url || url.port !== '' || url.username !== '' || url.password !== '') return false;
  return MAPS_HOSTS.has(url.hostname.toLowerCase());
}

/** A share link worth sending to the server: a maps URL with no coordinates in it. */
export function needsResolving(raw: string): boolean {
  return isMapsUrl(raw) && parsePastedCoords(raw) === null;
}

/** Same URL over https — the only scheme the resolver requests. */
export function toHttps(raw: string): string | null {
  const url = parseUrl(raw);
  if (!url) return null;
  url.protocol = 'https:';
  return url.toString();
}

/**
 * Google's cookie-consent interstitial wraps the real destination in
 * `continue=`. Unwrap it rather than requesting the consent page.
 */
export function unwrapConsent(raw: string): string {
  const url = parseUrl(raw);
  if (!url || url.hostname.toLowerCase() !== CONSENT_HOST) return raw;
  return url.searchParams.get('continue') ?? raw;
}

export type PlaceClue =
  | { kind: 'coords'; lat: number; lng: number }
  /** A plus code, with the place text Google appended after it (may be empty). */
  | { kind: 'plusCode'; code: string; locality: string }
  /**
   * Only a place name — can be geocoded, never exact — plus, when Google
   * wrote the link, the feature id (`ftid=0x…:0x…`) that names the exact
   * place the name stands for.
   */
  | { kind: 'text'; query: string; ftid: string | null };

const FTID = /^0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$/i;

const PLUS_CODE = /^([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7})(?:[\s,،]+(.*))?$/i;

/** Decode a query value the way Google wrote it: `+` is a space, except inside a plus code. */
function decodeQuery(raw: string): string {
  const spaced = raw.replace(
    /^([23456789CFGHJMPQRVWX]{2,8})(?:\+|%2B)([23456789CFGHJMPQRVWX]{2,7})(?=\+|%20|,|%2C|&|$)/i,
    '$1%2B$2',
  );
  try {
    return decodeURIComponent(spaced.replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

/** Raw (still encoded) value of the first of the named query params. */
function rawParam(url: URL, names: string[]): string | null {
  for (const part of url.search.replace(/^\?/, '').split('&')) {
    const cut = part.indexOf('=');
    if (cut === -1) continue;
    if (names.includes(part.slice(0, cut).toLowerCase())) return part.slice(cut + 1);
  }
  return null;
}

/** What a maps URL says about where the place is, most exact clue first. */
export function readPlaceClue(raw: string): PlaceClue | null {
  const coords = parsePastedCoords(raw);
  if (coords) return { kind: 'coords', ...coords };

  const url = parseUrl(raw);
  if (!url) return null;

  const query = rawParam(url, ['q', 'query', 'daddr', 'destination', 'address']);
  const path = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/i)?.[1];
  const text = decodeQuery(query ?? path ?? '');
  if (!text) return null;

  const code = text.match(PLUS_CODE);
  if (code?.[1]) return { kind: 'plusCode', code: code[1].toUpperCase(), locality: code[2] ?? '' };
  const ftid = rawParam(url, ['ftid']);
  return { kind: 'text', query: text, ftid: ftid && FTID.test(ftid) ? ftid.toLowerCase() : null };
}

/** Where Google's own embed page for the place is requested from — never a host the link chose. */
const EMBED_ORIGIN = 'https://www.google.com/maps';

/**
 * The URL of Google's iframe-embed page for a text clue. Unlike the
 * full Maps page, the embed page is rendered on the server and names
 * the matched place with its position, so a share link whose redirect
 * carries only a place name (the common case for the Maps app since
 * 2026) can still be pinned exactly. The feature id addresses the
 * place itself (`cid` is its second half in decimal); without one the
 * query is Google's best match for the text.
 */
export function embedUrlFor(clue: Extract<PlaceClue, { kind: 'text' }>): string {
  const params = new URLSearchParams();
  const cid = clue.ftid?.split(':')[1];
  if (cid) params.set('cid', BigInt(cid).toString(10));
  else params.set('q', clue.query);
  params.set('output', 'embed');
  return `${EMBED_ORIGIN}?${params.toString()}`;
}

/**
 * The matched place's position in an embed page: the entity block reads
 * `[["0x…:0x…","<name>",[lat,lng],…`. Nothing matched (an unknown place
 * or id) leaves no such block.
 */
const EMBED_PLACE =
  /\[\["0x[0-9a-f]+:0x[0-9a-f]+","(?:[^"\\]|\\.)*",\[(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/i;

export function readEmbedPosition(html: string): { lat: number; lng: number } | null {
  const m = html.match(EMBED_PLACE);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Search phrases to try for a place text, most specific first:
 * the whole text, then each comma-separated part from the end (the
 * city usually comes last), with postal codes dropped.
 */
export function geocodeCandidates(text: string): string[] {
  const clean = (value: string) =>
    value
      .replace(/[0-9٠-٩]{4,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const whole = clean(text.replace(/[،,]/g, ' '));
  const parts = text
    .split(/[،,]/)
    .map(clean)
    .filter((part) => part.length > 1)
    .reverse();
  return [...new Set([whole, ...parts])].filter((part) => part.length > 1);
}
