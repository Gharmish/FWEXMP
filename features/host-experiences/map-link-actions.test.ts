import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const who = vi.hoisted(() => ({ hostId: 'h1' as string | null }));
vi.mock('@/features/host-experiences/queries', () => ({
  getCurrentHostIdForWrite: async () => who.hostId,
}));

import { resolveMapLink } from './map-link-actions';

const SHORT = 'https://maps.app.goo.gl/AbCdEfGh12345678?g_st=ic';
const PLUS_CODE_URL =
  'https://maps.google.com?q=6G83+Q55+%D9%82%D8%B1%D9%8A%D8%A9+%D8%A7%D9%84%D9%85%D9%81%D8%AA%D8%A7%D8%AD%D8%A9%D8%8C+%D8%A3%D8%A8%D9%87%D8%A7+62521&ftid=0x15:0x32&entry=gps';

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const places = (rows: { lat: string; lon: string }[]) =>
  new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

let requested: string[];
let routes: Record<string, () => Response>;

beforeEach(() => {
  who.hostId = 'h1';
  requested = [];
  routes = {};
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    const host = new URL(url).hostname;
    const handler = routes[url] ?? routes[host];
    if (!handler) throw new Error(`unexpected request: ${url}`);
    return handler();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveMapLink', () => {
  it('resolves a Google Maps app share link that redirects to a plus code', async () => {
    routes[SHORT] = () => redirect(PLUS_CODE_URL);
    routes['nominatim.openstreetmap.org'] = () => places([{ lat: '18.2164', lon: '42.5044' }]);

    const result = await resolveMapLink(SHORT);

    expect(result).toEqual({ success: true, lat: 18.216887, lng: 42.502984, approximate: false });
    // The long link is read, never requested.
    expect(requested.filter((url) => url.includes('maps.google.com'))).toEqual([]);
  });

  it('still places the pin, flagged approximate, when the town cannot be geocoded', async () => {
    routes[SHORT] = () => redirect(PLUS_CODE_URL);
    routes['nominatim.openstreetmap.org'] = () => places([]);

    expect(await resolveMapLink(SHORT)).toEqual({
      success: true,
      lat: 18.216887,
      lng: 42.502984,
      approximate: true,
    });
  });

  it('resolves a short link that redirects to a URL with coordinates', async () => {
    routes[SHORT] = () =>
      redirect(
        'https://www.google.com/maps/place/Village/@18.3,42.4,15z/data=!3d18.216887!4d42.502984',
      );

    expect(await resolveMapLink(SHORT)).toEqual({
      success: true,
      lat: 18.216887,
      lng: 42.502984,
      approximate: false,
    });
  });

  it('unwraps a consent interstitial instead of requesting it', async () => {
    const target = 'https://www.google.com/maps/@18.2169,42.503,17z';
    routes[SHORT] = () =>
      redirect(`https://consent.google.com/m?continue=${encodeURIComponent(target)}`);

    expect(await resolveMapLink(SHORT)).toMatchObject({
      success: true,
      lat: 18.2169,
      lng: 42.503,
    });
    expect(requested).toEqual([SHORT]);
  });

  it('geocodes a name-only link and flags the pin approximate', async () => {
    routes['nominatim.openstreetmap.org'] = () => places([{ lat: '18.22', lon: '42.51' }]);

    expect(await resolveMapLink('https://maps.google.com/?q=Al+Muftaha+Village,+Abha')).toEqual({
      success: true,
      lat: 18.22,
      lng: 42.51,
      approximate: true,
    });
  });

  it('requests a plain-http redirect target over https', async () => {
    routes[SHORT] = () => redirect('http://goo.gl/maps/next');
    routes['https://goo.gl/maps/next'] = () =>
      redirect('https://www.google.com/maps/@18.2169,42.503,17z');

    expect(await resolveMapLink(SHORT)).toMatchObject({ success: true, lat: 18.2169 });
    expect(requested).toEqual([SHORT, 'https://goo.gl/maps/next']);
  });

  it('never follows a redirect off the maps allow-list', async () => {
    routes[SHORT] = () => redirect('https://169.254.169.254/latest/meta-data');

    expect(await resolveMapLink(SHORT)).toEqual({ success: false, message: 'not_found' });
    expect(requested).toEqual([SHORT]);
  });

  it('refuses a URL that is not a maps link without any request', async () => {
    expect(await resolveMapLink('https://example.com/?q=18.2,42.5')).toEqual({
      success: false,
      message: 'invalid',
    });
    expect(await resolveMapLink('')).toEqual({ success: false, message: 'invalid' });
    expect(requested).toEqual([]);
  });

  it('stops after a bounded number of redirects', async () => {
    routes['maps.app.goo.gl'] = () => redirect('https://maps.app.goo.gl/loop');

    expect(await resolveMapLink(SHORT)).toEqual({ success: false, message: 'not_found' });
    expect(requested.length).toBeLessThanOrEqual(5);
  });

  it('returns a failure state, not a throw, when the network fails', async () => {
    routes[SHORT] = () => {
      throw new Error('timeout');
    };

    expect(await resolveMapLink(SHORT)).toEqual({ success: false, message: 'server' });
  });

  it('is host-only', async () => {
    who.hostId = null;

    expect(await resolveMapLink(SHORT)).toEqual({ success: false, message: 'forbidden' });
    expect(requested).toEqual([]);
  });
});
