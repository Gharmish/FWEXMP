import { describe, expect, it } from 'vitest';
import {
  embedUrlFor,
  geocodeCandidates,
  isMapsUrl,
  needsResolving,
  readEmbedPosition,
  readPlaceClue,
  toHttps,
  unwrapConsent,
} from './map-link';

const SHORT = 'https://maps.app.goo.gl/AbCdEfGh12345678?g_st=ic';
const RESOLVED =
  'https://maps.google.com?q=6G83+Q55+%D9%82%D8%B1%D9%8A%D8%A9+%D8%A7%D9%84%D9%85%D9%81%D8%AA%D8%A7%D8%AD%D8%A9%D8%8C+%D8%A3%D8%A8%D9%87%D8%A7+62521&ftid=0x15:0x32&entry=gps';

describe('isMapsUrl', () => {
  it('allows Google and Apple maps hosts', () => {
    expect(isMapsUrl(SHORT)).toBe(true);
    expect(isMapsUrl('https://goo.gl/maps/abc')).toBe(true);
    expect(isMapsUrl('https://www.google.com/maps/place/Abha')).toBe(true);
    expect(isMapsUrl('https://maps.google.com.sa/?q=Abha')).toBe(true);
    expect(isMapsUrl('https://maps.apple.com/?q=Abha')).toBe(true);
    expect(isMapsUrl('https://maps.apple/p/abc')).toBe(true);
  });

  it('refuses everything else, including look-alikes and internal addresses', () => {
    expect(isMapsUrl('https://example.com/maps')).toBe(false);
    expect(isMapsUrl('https://maps.app.goo.gl.evil.com/x')).toBe(false);
    expect(isMapsUrl('https://evilgoogle.com/maps')).toBe(false);
    // Country domains are not trusted by pattern, only by name.
    expect(isMapsUrl('https://www.google.cm/maps')).toBe(false);
    expect(isMapsUrl('https://google.io/maps')).toBe(false);
    expect(isMapsUrl('https://google.com.evil.io/maps')).toBe(false);
    expect(isMapsUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isMapsUrl('https://localhost/maps')).toBe(false);
    expect(isMapsUrl('https://www.google.com:8443/maps')).toBe(false);
    expect(isMapsUrl('https://user@www.google.com/maps')).toBe(false);
    expect(isMapsUrl('file:///etc/passwd')).toBe(false);
    expect(isMapsUrl('18.2164, 42.5053')).toBe(false);
  });
});

describe('needsResolving', () => {
  it('is true for a maps link without coordinates only', () => {
    expect(needsResolving(SHORT)).toBe(true);
    expect(needsResolving(RESOLVED)).toBe(true);
    expect(needsResolving('https://www.google.com/maps/@18.2,42.5,13z')).toBe(false);
    expect(needsResolving('the green mountain')).toBe(false);
  });
});

describe('readPlaceClue', () => {
  it('reads the plus code and the place text from the link Google redirects to', () => {
    expect(readPlaceClue(RESOLVED)).toEqual({
      kind: 'plusCode',
      code: '6G83+Q55',
      locality: 'قرية المفتاحة، أبها 62521',
    });
  });

  it('reads a percent-encoded plus code and a bare one', () => {
    expect(readPlaceClue('https://www.google.com/maps?q=7HC46G83%2BQ55')).toEqual({
      kind: 'plusCode',
      code: '7HC46G83+Q55',
      locality: '',
    });
    expect(readPlaceClue('https://www.google.com/maps/place/6G83+Q55+Abha/')).toEqual({
      kind: 'plusCode',
      code: '6G83+Q55',
      locality: 'Abha',
    });
  });

  it('prefers coordinates when the link has them', () => {
    expect(readPlaceClue('https://maps.google.com/?q=18.2164,42.5053')).toEqual({
      kind: 'coords',
      lat: 18.2164,
      lng: 42.5053,
    });
  });

  it('falls back to the place name', () => {
    expect(readPlaceClue('https://maps.google.com/?q=Al+Muftaha+Village,+Abha')).toEqual({
      kind: 'text',
      query: 'Al Muftaha Village, Abha',
      ftid: null,
    });
    expect(readPlaceClue('https://www.google.com/maps/place/Green+Mountain/data=!4m2')).toEqual({
      kind: 'text',
      query: 'Green Mountain',
      ftid: null,
    });
  });

  it('keeps the feature id Google puts next to a place name', () => {
    // The Maps app's share links (2026) redirect to a name plus `ftid`, no plus code.
    expect(
      readPlaceClue(
        'https://maps.google.com?q=%D9%85%D8%AE%D9%8A%D9%85%D8%A7%D8%AA+Country+Road+RV+and+Camp,+7025+Almarooj,+%D8%A3%D8%A8%D9%87%D8%A7+62527&ftid=0x15E355F7E489D925:0x496a74d5337cbb8c&entry=gps&g_st=ic',
      ),
    ).toEqual({
      kind: 'text',
      query: 'مخيمات Country Road RV and Camp, 7025 Almarooj, أبها 62527',
      ftid: '0x15e355f7e489d925:0x496a74d5337cbb8c',
    });
    // Anything that is not two hex halves is dropped, never sent on.
    expect(readPlaceClue('https://maps.google.com?q=Abha&ftid=../etc')).toMatchObject({
      kind: 'text',
      ftid: null,
    });
  });

  it('returns null when the link says nothing about a place', () => {
    expect(readPlaceClue(SHORT)).toBeNull();
    expect(readPlaceClue('not a url')).toBeNull();
  });
});

describe('unwrapConsent', () => {
  it('returns the wrapped destination of a consent interstitial', () => {
    const target = 'https://www.google.com/maps/@18.2,42.5,13z';
    expect(
      unwrapConsent(`https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=DE`),
    ).toBe(target);
    expect(unwrapConsent(target)).toBe(target);
  });
});

describe('toHttps', () => {
  it('upgrades http and rejects non-URLs', () => {
    expect(toHttps('http://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc');
    expect(toHttps('nope')).toBeNull();
  });
});

describe('embedUrlFor', () => {
  it('addresses the place by id when the link had one, by text otherwise', () => {
    expect(
      embedUrlFor({
        kind: 'text',
        query: 'Country Road RV and Camp, Abha',
        ftid: '0x15e355f7e489d925:0x496a74d5337cbb8c',
      }),
    ).toBe('https://www.google.com/maps?cid=5290169171340737420&output=embed');
    expect(embedUrlFor({ kind: 'text', query: 'قرية المفتاحة، أبها', ftid: null })).toBe(
      'https://www.google.com/maps?q=%D9%82%D8%B1%D9%8A%D8%A9+%D8%A7%D9%84%D9%85%D9%81%D8%AA%D8%A7%D8%AD%D8%A9%D8%8C+%D8%A3%D8%A8%D9%87%D8%A7&output=embed',
    );
  });

  it('only ever builds a www.google.com URL', () => {
    expect(isMapsUrl(embedUrlFor({ kind: 'text', query: 'x', ftid: null }))).toBe(true);
    expect(
      isMapsUrl(embedUrlFor({ kind: 'text', query: 'https://evil.example/?', ftid: null })),
    ).toBe(true);
  });
});

describe('readEmbedPosition', () => {
  // Trimmed from the real page for the campsite link the owner pasted on 2026-09-30.
  const PAGE =
    '<script>initEmbed([null,null,null,null,null,[[[2,"spotlit"]]],null,null,[[null,[[["1577198817689327909","5290169171340737420"],"/g/11krdlkrm6",null,[182125576,425472081]]]]],null,["en"],null,[[[3789.94,42.5472081,18.2125576],[0,0,0],null,13.1],null,null,[["0x15e355f7e489d925:0x496a74d5337cbb8c","مخيمات و كرفانات مزارع كنتري رود Country Road RV and Camp, 7025 Almarooj, Abha 62527",[18.2125576,42.5472081],"5290169171340737420"]]]])</script>';

  it('reads the matched place, not the camera', () => {
    expect(readEmbedPosition(PAGE)).toEqual({ lat: 18.2125576, lng: 42.5472081 });
  });

  it('reads a name with an escaped quote in it', () => {
    expect(readEmbedPosition('[["0x1:0x2","Abu \\"Ali\\" Camp, Abha",[18.21,42.54],"x"]')).toEqual({
      lat: 18.21,
      lng: 42.54,
    });
  });

  it('finds nothing on a page for an unknown place or id', () => {
    expect(
      readEmbedPosition('<script>initEmbed([null,null,null,null,null,null])</script>'),
    ).toBeNull();
    expect(readEmbedPosition('')).toBeNull();
    // Out-of-range numbers are not a position.
    expect(readEmbedPosition('[["0x1:0x2","x",[95.0,42.5]]')).toBeNull();
  });
});

describe('geocodeCandidates', () => {
  it('tries the whole text, then the parts from the end, without postal codes', () => {
    expect(geocodeCandidates('قرية المفتاحة، أبها 62521')).toEqual([
      'قرية المفتاحة أبها',
      'أبها',
      'قرية المفتاحة',
    ]);
    expect(geocodeCandidates('Abha')).toEqual(['Abha']);
    expect(geocodeCandidates('')).toEqual([]);
  });
});
