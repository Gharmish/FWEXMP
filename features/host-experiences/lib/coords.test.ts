import { describe, expect, it } from 'vitest';
import { parsePastedCoords } from './coords';

describe('parsePastedCoords', () => {
  it('parses a bare "lat, lng" pair', () => {
    expect(parsePastedCoords('18.2164, 42.5053')).toEqual({ lat: 18.2164, lng: 42.5053 });
  });

  it('parses a pair separated by an Arabic comma', () => {
    expect(parsePastedCoords('18.2164، 42.5053')).toEqual({ lat: 18.2164, lng: 42.5053 });
  });

  it('parses a Google Maps @lat,lng,zoom URL', () => {
    expect(
      parsePastedCoords('https://www.google.com/maps/place/Abha/@18.2465,42.5117,13z/data=xyz'),
    ).toEqual({ lat: 18.2465, lng: 42.5117 });
  });

  it('parses a share link with a q= param (URL-encoded comma)', () => {
    expect(parsePastedCoords('https://maps.google.com/?q=18.2164%2C42.5053')).toEqual({
      lat: 18.2164,
      lng: 42.5053,
    });
  });

  it('parses an api=1 search link with query=', () => {
    expect(
      parsePastedCoords('https://www.google.com/maps/search/?api=1&query=18.21,42.50'),
    ).toEqual({ lat: 18.21, lng: 42.5 });
  });

  it('returns null for prose, empty input, and coordinate-free URLs', () => {
    expect(parsePastedCoords('')).toBeNull();
    expect(parsePastedCoords('the green mountain, Abha')).toBeNull();
    expect(parsePastedCoords('https://maps.google.com/?q=Abha')).toBeNull();
  });

  it('prefers the place pair over the viewport centre in a place URL', () => {
    expect(
      parsePastedCoords(
        'https://www.google.com/maps/place/Village/@18.30,42.40,15z/data=!4m6!3m5!8m2!3d18.216887!4d42.502984',
      ),
    ).toEqual({ lat: 18.216887, lng: 42.502984 });
  });

  it('parses coordinates in the path and in Apple Maps params', () => {
    expect(
      parsePastedCoords('https://www.google.com/maps/search/18.2169,+42.503?entry=tts'),
    ).toEqual({ lat: 18.2169, lng: 42.503 });
    expect(parsePastedCoords('https://maps.apple.com/?ll=18.2169,42.503&q=Village')).toEqual({
      lat: 18.2169,
      lng: 42.503,
    });
    expect(parsePastedCoords('https://maps.apple.com/place?coordinate=18.2169,42.503')).toEqual({
      lat: 18.2169,
      lng: 42.503,
    });
  });

  it('finds nothing in a short share link or a plus-code link', () => {
    expect(parsePastedCoords('https://maps.app.goo.gl/AbCdEfGh12345678?g_st=ic')).toBeNull();
    expect(parsePastedCoords('https://maps.google.com?q=6G83+Q55+Abha&ftid=0x15:0x32')).toBeNull();
  });

  it('ignores number pairs that cannot be coordinates', () => {
    expect(parsePastedCoords('https://maps.google.com/?q=120.5,42.5')).toBeNull();
  });

  it('keeps negative coordinates intact', () => {
    expect(parsePastedCoords('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
});
