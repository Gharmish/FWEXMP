import { describe, expect, it } from 'vitest';
import {
  geocodeCandidates,
  isMapsUrl,
  needsResolving,
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
    });
    expect(readPlaceClue('https://www.google.com/maps/place/Green+Mountain/data=!4m2')).toEqual({
      kind: 'text',
      query: 'Green Mountain',
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
