import { parsePastedCoords } from '@/features/host-experiences/lib/coords';

/**
 * Reading a maps share link, pure half. The server action
 * (`map-link-actions.ts`) follows the redirects; everything here decides
 * what may be followed and what a URL says about the place, so the
 * rules are unit-testable without a network.
 */

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.apple']);
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/;
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
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host) || host === 'maps.apple.com') return true;
  return GOOGLE_HOST.test(host);
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
  /** Only a place name — can be geocoded, never exact. */
  | { kind: 'text'; query: string };

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
  return { kind: 'text', query: text };
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
