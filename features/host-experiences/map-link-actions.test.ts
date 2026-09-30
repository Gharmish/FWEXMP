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

/** The chain the owner's campsite link took on 2026-09-30: a name plus `ftid`, no coordinates. */
const NAME_URL =
  'https://maps.google.com?q=%D9%85%D8%AE%D9%8A%D9%85%D8%A7%D8%AA+Country+Road+RV+and+Camp,+7025+Almarooj,+%D8%A3%D8%A8%D9%87%D8%A7+62527&ftid=0x15e355f7e489d925:0x496a74d5337cbb8c&entry=gps&shh=CAE&g_st=ic';
const CID_EMBED = 'https://www.google.com/maps?cid=5290169171340737420&output=embed';
const EMBED_PAGE =
  '<script>initEmbed([[[[3789.94,42.5472081,18.2125576],[0,0,0]],null,null,[["0x15e355f7e489d925:0x496a74d5337cbb8c","Country Road RV and Camp, Abha",[18.2125576,42.5472081],"5290169171340737420"]]]])</script>';
const EMPTY_PAGE = '<script>initEmbed([null,null,null,null,null,null])</script>';

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const page = (html: string) =>
  new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
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

  it('pins a Maps-app share link that redirects to a place name plus feature id, exactly', async () => {
    routes[SHORT] = () => redirect(NAME_URL);
    routes[CID_EMBED] = () => redirect('https://www.google.com/maps/embed?origin=mfe&pb=!1m3!4s5');
    routes['https://www.google.com/maps/embed?origin=mfe&pb=!1m3!4s5'] = () => page(EMBED_PAGE);

    expect(await resolveMapLink(SHORT)).toEqual({
      success: true,
      lat: 18.2125576,
      lng: 42.5472081,
      approximate: false,
    });
    // The place is asked of Google by id, not by name, and the geocoder is not needed.
    expect(requested).toEqual([
      SHORT,
      CID_EMBED,
      'https://www.google.com/maps/embed?origin=mfe&pb=!1m3!4s5',
    ]);
  });

  it('falls back to the geocoder when Google matches nothing for the id', async () => {
    routes[SHORT] = () => redirect(NAME_URL);
    routes[CID_EMBED] = () => page(EMPTY_PAGE);
    routes['nominatim.openstreetmap.org'] = () => places([{ lat: '18.22', lon: '42.51' }]);

    expect(await resolveMapLink(SHORT)).toEqual({
      success: true,
      lat: 18.22,
      lng: 42.51,
      approximate: true,
    });
  });

  it('falls back to the geocoder when the embed lookup fails or wanders off-list', async () => {
    routes[SHORT] = () => redirect(NAME_URL);
    routes[CID_EMBED] = () => redirect('https://consent.google.com/m?continue=x');
    routes['nominatim.openstreetmap.org'] = () => places([{ lat: '18.22', lon: '42.51' }]);

    expect(await resolveMapLink(SHORT)).toMatchObject({ success: true, approximate: true });
    expect(requested).not.toContain('https://consent.google.com/m?continue=x');

    requested = [];
    routes[CID_EMBED] = () => {
      throw new Error('timeout');
    };
    expect(await resolveMapLink(SHORT)).toMatchObject({ success: true, lat: 18.22 });
  });

  it("uses Google's match for a name-only link but keeps it flagged approximate", async () => {
    routes['https://www.google.com/maps?q=Al+Muftaha+Village%2C+Abha&output=embed'] = () =>
      page('[["0x1:0x2","Al Muftaha, Abha 62521",[18.2127325,42.4933704],"3"]');

    expect(await resolveMapLink('https://maps.google.com/?q=Al+Muftaha+Village,+Abha')).toEqual({
      success: true,
      lat: 18.2127325,
      lng: 42.4933704,
      approximate: true,
    });
    expect(requested.some((url) => url.includes('nominatim'))).toBe(false);
  });

  it('geocodes a name-only link and flags the pin approximate', async () => {
    routes['https://www.google.com/maps?q=Al+Muftaha+Village%2C+Abha&output=embed'] = () =>
      page(EMPTY_PAGE);
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
