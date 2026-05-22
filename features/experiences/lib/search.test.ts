import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  DURATION_BUCKETS,
  EMPTY_CRITERIA,
  PRICE_BUCKETS,
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
    ratingAverage: overrides.ratingAverage ?? null,
    ratingCount: overrides.ratingCount ?? 0,
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
    expect(parseSearchParams({ sort: 'ratingDesc' }).sort).toBe('ratingDesc');
  });

  it('accepts the valid price buckets and falls back to null otherwise', () => {
    for (const bucket of PRICE_BUCKETS) {
      expect(parseSearchParams({ price: bucket }).priceBucket).toBe(bucket);
    }
    expect(parseSearchParams({}).priceBucket).toBeNull();
    expect(parseSearchParams({ price: 'made-up' }).priceBucket).toBeNull();
    expect(parseSearchParams({ price: '' }).priceBucket).toBeNull();
  });

  it('accepts the valid duration buckets and falls back to null otherwise', () => {
    for (const bucket of DURATION_BUCKETS) {
      expect(parseSearchParams({ duration: bucket }).durationBucket).toBe(bucket);
    }
    expect(parseSearchParams({}).durationBucket).toBeNull();
    expect(parseSearchParams({ duration: 'forever' }).durationBucket).toBeNull();
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
      priceBucket: '200-500',
      durationBucket: '2-4h',
      sort: 'priceDesc',
    };
    const qs = toSearchParams(original).toString();
    const round = parseSearchParams(Object.fromEntries(new URLSearchParams(qs).entries()));
    expect(round).toEqual(original);
  });

  it('omits null buckets from the URL', () => {
    const qs = toSearchParams({ ...EMPTY_CRITERIA, priceBucket: null }).toString();
    expect(qs).toBe('');
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
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, priceBucket: 'under-200' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_CRITERIA, durationBucket: 'half-day' })).toBe(true);
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

describe('price + duration buckets', () => {
  const all: readonly ExperienceSummary[] = [
    // priceSar, durationMinutes
    exp({ slug: 'free-walk', priceSar: 0, durationMinutes: 60 }), // under-200, under-2h
    exp({ slug: 'short', priceSar: 199, durationMinutes: 90 }), // under-200, under-2h
    exp({ slug: 'mid', priceSar: 200, durationMinutes: 180 }), // 200-500, 2-4h
    exp({ slug: 'edge-500', priceSar: 499, durationMinutes: 239 }), // 200-500, 2-4h
    exp({ slug: 'half', priceSar: 500, durationMinutes: 240 }), // 500-1000, half-day
    exp({ slug: 'premium', priceSar: 999, durationMinutes: 359 }), // 500-1000, half-day
    exp({ slug: 'lux', priceSar: 1000, durationMinutes: 360 }), // over-1000, full-day
    exp({ slug: 'epic', priceSar: 2500, durationMinutes: 720 }), // over-1000, full-day
  ];

  it('each price has exactly one bucket (half-open intervals)', () => {
    // Sum of bucket matches should equal the dataset size — i.e. every
    // row belongs to exactly one bucket, none overlap.
    const totals = PRICE_BUCKETS.reduce((acc, bucket) => {
      const filtered = filterExperiences(all, { ...EMPTY_CRITERIA, priceBucket: bucket });
      return acc + filtered.length;
    }, 0);
    expect(totals).toBe(all.length);
  });

  it('each duration has exactly one bucket (half-open intervals)', () => {
    const totals = DURATION_BUCKETS.reduce((acc, bucket) => {
      const filtered = filterExperiences(all, { ...EMPTY_CRITERIA, durationBucket: bucket });
      return acc + filtered.length;
    }, 0);
    expect(totals).toBe(all.length);
  });

  it('boundary values land in the upper bucket (200, 500, 1000)', () => {
    // priceSar=200 is in '200-500', not 'under-200'.
    const upper = filterExperiences(all, { ...EMPTY_CRITERIA, priceBucket: '200-500' });
    expect(upper.map((r) => r.slug)).toContain('mid');

    // priceSar=199 stays in 'under-200'.
    const lower = filterExperiences(all, { ...EMPTY_CRITERIA, priceBucket: 'under-200' });
    expect(lower.map((r) => r.slug)).toContain('short');
    expect(lower.map((r) => r.slug)).not.toContain('mid');
  });

  it('over-1000 is open-ended on the top', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, priceBucket: 'over-1000' });
    expect(result.map((r) => r.slug).sort()).toEqual(['epic', 'lux']);
  });

  it('full-day is open-ended on the top', () => {
    const result = filterExperiences(all, { ...EMPTY_CRITERIA, durationBucket: 'full-day' });
    expect(result.map((r) => r.slug).sort()).toEqual(['epic', 'lux']);
  });

  it('price + duration compose as AND', () => {
    const result = filterExperiences(all, {
      ...EMPTY_CRITERIA,
      priceBucket: '200-500',
      durationBucket: '2-4h',
    });
    expect(result.map((r) => r.slug).sort()).toEqual(['edge-500', 'mid']);
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

describe('sortExperiences — ratingDesc', () => {
  it('orders rated experiences by average rating descending', () => {
    const rows = [
      exp({ slug: 'low', ratingAverage: 3.5, ratingCount: 4 }),
      exp({ slug: 'high', ratingAverage: 4.9, ratingCount: 27 }),
      exp({ slug: 'mid', ratingAverage: 4.2, ratingCount: 12 }),
    ];
    const out = sortExperiences(rows, 'ratingDesc');
    expect(out.map((r) => r.slug)).toEqual(['high', 'mid', 'low']);
  });

  it('sinks unrated experiences to the bottom regardless of input order', () => {
    const rows = [
      exp({ slug: 'unrated-1', ratingAverage: null, ratingCount: 0 }),
      exp({ slug: 'rated-low', ratingAverage: 3.0, ratingCount: 2 }),
      exp({ slug: 'unrated-2', ratingAverage: null, ratingCount: 0 }),
      exp({ slug: 'rated-high', ratingAverage: 5.0, ratingCount: 1 }),
    ];
    const out = sortExperiences(rows, 'ratingDesc');
    expect(out.map((r) => r.slug)).toEqual(['rated-high', 'rated-low', 'unrated-1', 'unrated-2']);
  });

  it('preserves input order among same-rating rows (stable)', () => {
    const rows = [
      exp({ slug: 'a', ratingAverage: 4.5, ratingCount: 5 }),
      exp({ slug: 'b', ratingAverage: 4.5, ratingCount: 5 }),
      exp({ slug: 'c', ratingAverage: 4.5, ratingCount: 5 }),
    ];
    const out = sortExperiences(rows, 'ratingDesc');
    expect(out.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
  });

  it('handles an all-unrated input as a no-op', () => {
    const rows = [exp({ slug: 'a', ratingAverage: null }), exp({ slug: 'b', ratingAverage: null })];
    const out = sortExperiences(rows, 'ratingDesc');
    expect(out.map((r) => r.slug)).toEqual(['a', 'b']);
  });
});
