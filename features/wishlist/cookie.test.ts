import { describe, expect, it } from 'vitest';
import {
  WISHLIST_MAX_SIZE,
  addToWishlistList,
  isInWishlist,
  parseWishlistCookie,
  removeFromWishlistList,
  serializeWishlistCookie,
} from './cookie';

describe('parseWishlistCookie', () => {
  it('returns an empty array for undefined / empty input', () => {
    expect(parseWishlistCookie(undefined)).toEqual([]);
    expect(parseWishlistCookie('')).toEqual([]);
  });

  it('splits a comma-separated list of slugs', () => {
    expect(parseWishlistCookie('juniper-walk,evening-with-flower-men')).toEqual([
      'juniper-walk',
      'evening-with-flower-men',
    ]);
  });

  it('strips whitespace around each slug', () => {
    expect(parseWishlistCookie(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('drops entries that do not look like slugs', () => {
    expect(parseWishlistCookie('valid,UPPER,with space,evil<script>,trailing-')).toEqual(['valid']);
  });

  it('de-duplicates while preserving order', () => {
    expect(parseWishlistCookie('a,b,a,c,b')).toEqual(['a', 'b', 'c']);
  });

  it('caps at WISHLIST_MAX_SIZE', () => {
    const overflow = Array.from({ length: WISHLIST_MAX_SIZE + 5 }, (_, i) => `slug-${i}`).join(',');
    expect(parseWishlistCookie(overflow)).toHaveLength(WISHLIST_MAX_SIZE);
  });
});

describe('serializeWishlistCookie', () => {
  it('is the inverse of parse for valid input', () => {
    const slugs = ['a', 'b-c', 'd-e-f'];
    const cookie = serializeWishlistCookie(slugs);
    expect(parseWishlistCookie(cookie)).toEqual(slugs);
  });

  it('de-duplicates the input list', () => {
    expect(serializeWishlistCookie(['a', 'b', 'a'])).toBe('a,b');
  });

  it('returns an empty string for an empty list', () => {
    expect(serializeWishlistCookie([])).toBe('');
  });
});

describe('addToWishlistList', () => {
  it('adds a new slug to the front (newest-first)', () => {
    expect(addToWishlistList(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('bumps an existing slug to the front rather than duplicating', () => {
    expect(addToWishlistList(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('respects WISHLIST_MAX_SIZE — drops the oldest', () => {
    const full = Array.from({ length: WISHLIST_MAX_SIZE }, (_, i) => `s-${i}`);
    const result = addToWishlistList(full, 'newcomer');
    expect(result).toHaveLength(WISHLIST_MAX_SIZE);
    expect(result[0]).toBe('newcomer');
    // The previously-last slug got dropped.
    expect(result.at(-1)).toBe(`s-${WISHLIST_MAX_SIZE - 2}`);
  });
});

describe('removeFromWishlistList', () => {
  it('removes the slug if present', () => {
    expect(removeFromWishlistList(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('is a no-op when the slug is missing', () => {
    expect(removeFromWishlistList(['a', 'b'], 'z')).toEqual(['a', 'b']);
  });
});

describe('isInWishlist', () => {
  it('reports membership', () => {
    expect(isInWishlist(['a', 'b'], 'a')).toBe(true);
    expect(isInWishlist(['a', 'b'], 'z')).toBe(false);
  });
});
