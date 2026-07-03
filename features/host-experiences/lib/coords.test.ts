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

  it('keeps negative coordinates intact', () => {
    expect(parsePastedCoords('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
});
