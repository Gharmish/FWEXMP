import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  EMPTY_CRITERIA,
  filterExperiences,
  hasActiveFilters,
  parseSearchParams,
  sortExperiences,
  toSearchParams,
  type ExperienceCriteria,
} from './search';
import type { ExperienceSummary } from '@/features/experiences/types';
import type { Category } from '@/lib/colors';

function exp(overrides: Partial<ExperienceSummary> & { slug: string }): ExperienceSummary {
  return {
    slug: overrides.slug,
    titleEn: overrides.titleEn ?? 'Title',
    titleAr: overrides.titleAr ?? 'العنوان',
    descriptionEn: overrides.descriptionEn ?? '',
    descriptionAr: overrides.descriptionAr ?? '',
    category: overrides.category ?? 'nature',
    priceSar: overrides.priceSar ?? 300,
    durationMinutes: overrides.durationMinutes ?? 120,
    placeName: overrides.placeName ?? 'Place',
    hostName: overrides.hostName ?? 'Host',
    featured: overrides.featured ?? false,
  };
}

describe('parseSearchParams', () => {
  it('returns EMPTY_CRITERIA-equivalent values for an empty object', () => {
    expect(parseSearchParams({})).toEqual(EMPTY_CRITERIA);
  });

  it('lower-cases and trims free-text query', () => {
    expect(parseSearchParams({ q: '  Coffee Ritual  ' }).q).toBe('coffee ritual');
  });

  it('accepts a comma-separated category list', () => {
    expect(parseSearchParams({ category: 'nature,heritage' }).categories).toEqual([
      'nature',
      'heritage',
    ]);
  });

  it('accepts an array-form category param', () => {
    expect(parseSearchParams({ category: ['nature', 'food'] }).categories).toEqual([
      'nature',
      'food',
    ]);
  });

  it('drops unknown category values silently', () => {
    expect(parseSearchParams({ category: 'nature,not-a-real-category' }).categories).toEqual([
      'nature',
    ]);
  });

  it('de-duplicates categories while preserving order', () => {
    expect(parseSearchParams({ category: 'nature,nature,food' }).categories).toEqual([
      'nature',
      'food',
    ]);
  });

  it('reads the originals toggle as exactly "1"', () => {
    expect(parseSearchParams({ originals: '1' }).originalsOnly).toBe(true);
    expect(parseSearchParams({ originals: 'true' }).originalsOnly).toBe(false);
    expect(parseSearchParams({ originals: '' }).originalsOnly).toBe(false);
  });

  it('falls back to DEFAULT_SORT when sort is missing or unknown', () => {
    expect(parseSearchParams({}).sort).toBe(DEFAULT_SORT);
    expect(parseSearchParams({ sort: 'made-up' }).sort).toBe(DEFAULT_SORT);
  });

  it('accepts the valid sort keys', () => {
    expect(parseSearchParams({ sort: 'priceAsc' }).sort).toBe('priceAsc');
    expect(parseSearchParams({ sort: 'priceDesc' }).sort).toBe('priceDesc');
    expect(parseSearchParams({ sort: 'newest' }).sort).toBe('newest');
    expect(parseSearchParams({ sort: 'featured' }).sort).toBe('featured');
  });
});

describe('toSearchParams', () => {
  it('omits default sort + empty fields, keeping URLs clean', () => {
    const qs = toSearchParams(EMPTY_CRITERIA).toString();
    expect(qs).toBe('');
  });

  it('serializes a non-default sort', () => {
    const qs = toSearchParams({ ...EMPTY_CRITERIA, sort: 'priceAsc' }).toString();
    expect(qs).toBe('sort=priceAsc');
  });

  it('round-trips multi-category criteria via URLSearchParams', () => {
    const original: ExperienceCriteria = {
      q: 'coffee',
      categories: ['nature', 'food'] as Category[],
      originalsOnly: true,
      sort: 'priceDesc',
    };
    const qs = toSearchParams(original).toString();
    const round = parseSearchParams(Object.fromEntries(new URLSearchParams(qs).entries()));
    expect(round).toEqual(original);
  });
});

describe('hasActiveFilters', () => {
  it('reports false on EMPTY_CRITERIA', () => {
    expect(hasActiveFilters(EMPTY_CRITERIA)).toBe(false);
  });

  it('reports true on any non-default field', () => {
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, q: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, originalsOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, categories: ['nature'] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, sort: 'priceAsc' })).toBe(true);
  });
});

describe('filterExperiences', () => {
  const all: readonly ExperienceSummary[] = [
    exp({ slug: 'a', category: 'nature', priceSar: 100, featured: true, titleEn: 'Juniper walk' }),
    exp({ slug: 'b', category: 'food', priceSar: 200, titleEn: 'Coffee ritual' }),
    exp({ slug: 'c', category: 'heritage', priceSar: 300, titleEn: 'Heritage tour' }),
    exp({ slug: 'd', category: 'adventure', priceSar: 400, featured: true, placeName: 'Soudah' }),
  ];

  it('returns the full list when criteria are empty', () => {
    expect(filterExperiences(all, EMPTY_CRITERIA)).toHaveLength(4);
  });

  it('filters by single category', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, categories: ['food'] });
    expect(result.map((r) => r.slug)).toEqual(['b']);
  });

  it('treats multiple categories as OR (union)', () => {
    const result = filterExperiences(all, {
      ...EMPTY_CRITERIA,
      categories: ['food', 'heritage'],
    });
    expect(result.map((r) => r.slug)).toEqual(['b', 'c']);
  });

  it('originalsOnly keeps only featured rows', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, originalsOnly: true });
    expect(result.map((r) => r.slug)).toEqual(['a', 'd']);
  });

  it('free-text matches substring in EN title', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, q: 'coffee' });
    expect(result.map((r) => r.slug)).toEqual(['b']);
  });

  it('free-text matches place name', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, q: 'soudah' });
    expect(result.map((r) => r.slug)).toEqual(['d']);
  });

  it('combines criteria as AND', () => {
    // featured AND category=adventure
    const result = filterExperiences(all, {
      ...EMPTY_CRITERIA,
      categories: ['adventure'],
      originalsOnly: true,
    });
    expect(result.map((r) => r.slug)).toEqual(['d']);
  });

  it('returns an empty array when nothing matches', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, q: 'nonexistent-token-xyz' });
    expect(result).toEqual([]);
  });
});

describe('sortExperiences', () => {
  const all: readonly ExperienceSummary[] = [
    exp({ slug: 'a', priceSar: 100 }),
    exp({ slug: 'b', priceSar: 500, featured: true }),
    exp({ slug: 'c', priceSar: 200 }),
    exp({ slug: 'd', priceSar: 300, featured: true }),
  ];

  it('featured sort puts featured rows first, preserving order otherwise', () => {
    const out = sortExperiences(all, 'featured');
    expect(
      out
        .slice(0, 2)
        .map((r) => r.slug)
        .sort(),
    ).toEqual(['b', 'd']);
    // Non-featured tail still contains a and c.
    const tail = out.slice(2).map((r) => r.slug);
    expect(tail).toEqual(expect.arrayContaining(['a', 'c']));
  });

  it('priceAsc / priceDesc sort by SAR', () => {
    expect(sortExperiences(all, 'priceAsc').map((r) => r.priceSar)).toEqual([100, 200, 300, 500]);
    expect(sortExperiences(all, 'priceDesc').map((r) => r.priceSar)).toEqual([500, 300, 200, 100]);
  });

  it('newest reverses the input (which is ASC by createdAt)', () => {
    expect(sortExperiences(all, 'newest').map((r) => r.slug)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('does not mutate the input list', () => {
    const before = all.map((r) => r.slug);
    sortExperiences(all, 'priceAsc');
    expect(all.map((r) => r.slug)).toEqual(before);
  });
});
