import type { Category } from '@/lib/colors';
import type { ExperienceSummary } from '@/features/experiences/types';

/**
 * Pure filter / sort helpers for the experiences catalog.
 *
 * Filtering and sorting both happen in-memory after the data accessor
 * returns. The dataset is small at launch (6 Abha experiences, growing
 * to dozens in Phase 1) so a JS pass is cheaper than per-request
 * Drizzle plans and keeps the sample-data fallback identical to the DB
 * path. When the catalog grows past a few hundred rows the criteria
 * here will be pushed into the Drizzle WHERE clause and orderBy.
 *
 * The shapes are also URL-state friendly: parseSearchParams reads a
 * Next.js searchParams object and produces a canonical Criteria object;
 * toSearchParams does the reverse for building filter links.
 */

/** Sort options exposed in the UI. */
export const SORT_KEYS = ['featured', 'newest', 'priceAsc', 'priceDesc'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = 'featured';

/**
 * Price buckets in Saudi Riyal — discrete instead of a free-range slider
 * to keep the URL-state clean and the UI restrained (BRIEF §1 brand
 * pillar: restraint). Half-open intervals so every price belongs to
 * exactly one bucket: [0, 200), [200, 500), [500, 1000), [1000, ∞).
 */
export const PRICE_BUCKETS = ['under-200', '200-500', '500-1000', 'over-1000'] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number];

/**
 * Duration buckets in minutes. Half-open intervals: [0, 120), [120, 240),
 * [240, 360), [360, ∞). The labels in the UI translate as 'Under 2hr',
 * '2-4hr', 'Half day', 'Full day' — they're brand copy, not exact bounds.
 */
export const DURATION_BUCKETS = ['under-2h', '2-4h', 'half-day', 'full-day'] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export interface ExperienceCriteria {
  /** Free-text query, lower-cased, trimmed. Empty string when absent. */
  q: string;
  /** Selected categories (intersection with the brand-fixed set). */
  categories: readonly Category[];
  /** When true, restrict to featured (Originals) experiences. */
  originalsOnly: boolean;
  /** Single-select price bucket, or null when no price filter is active. */
  priceBucket: PriceBucket | null;
  /** Single-select duration bucket, or null when no duration filter is active. */
  durationBucket: DurationBucket | null;
  sort: SortKey;
}

export const EMPTY_CRITERIA: ExperienceCriteria = {
  q: '',
  categories: [],
  originalsOnly: false,
  priceBucket: null,
  durationBucket: null,
  sort: DEFAULT_SORT,
};

/** Brand-fixed category keys — keep in sync with the schema enum. */
const VALID_CATEGORIES: readonly Category[] = [
  'nature',
  'heritage',
  'food',
  'wellness',
  'adventure',
  'family',
];

const VALID_SORTS = new Set<SortKey>(SORT_KEYS);
const VALID_PRICE_BUCKETS = new Set<PriceBucket>(PRICE_BUCKETS);
const VALID_DURATION_BUCKETS = new Set<DurationBucket>(DURATION_BUCKETS);

type SearchParamValue = string | string[] | undefined;
type SearchParamsObject = Readonly<Record<string, SearchParamValue>>;

function asList(value: SearchParamValue): readonly string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => v.split(','));
  return value.split(',');
}

function asString(value: SearchParamValue): string {
  if (!value) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

export function parseSearchParams(searchParams: SearchParamsObject): ExperienceCriteria {
  const rawCategories = asList(searchParams.category)
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is Category => VALID_CATEGORIES.includes(c as Category));
  // De-dup while preserving order.
  const categories = Array.from(new Set(rawCategories)) as Category[];

  const sortRaw = asString(searchParams.sort).trim() as SortKey;
  const sort = VALID_SORTS.has(sortRaw) ? sortRaw : DEFAULT_SORT;

  const priceRaw = asString(searchParams.price).trim() as PriceBucket;
  const priceBucket = VALID_PRICE_BUCKETS.has(priceRaw) ? priceRaw : null;

  const durationRaw = asString(searchParams.duration).trim() as DurationBucket;
  const durationBucket = VALID_DURATION_BUCKETS.has(durationRaw) ? durationRaw : null;

  return {
    q: asString(searchParams.q).trim().toLowerCase(),
    categories,
    originalsOnly: asString(searchParams.originals) === '1',
    priceBucket,
    durationBucket,
    sort,
  };
}

/**
 * Serialize criteria back into a URLSearchParams. Defaults are omitted
 * to keep URLs clean and shareable.
 */
export function toSearchParams(criteria: ExperienceCriteria): URLSearchParams {
  const params = new URLSearchParams();
  if (criteria.q) params.set('q', criteria.q);
  if (criteria.categories.length > 0) params.set('category', criteria.categories.join(','));
  if (criteria.originalsOnly) params.set('originals', '1');
  if (criteria.priceBucket) params.set('price', criteria.priceBucket);
  if (criteria.durationBucket) params.set('duration', criteria.durationBucket);
  if (criteria.sort !== DEFAULT_SORT) params.set('sort', criteria.sort);
  return params;
}

export function hasActiveFilters(criteria: ExperienceCriteria): boolean {
  return (
    criteria.q.length > 0 ||
    criteria.categories.length > 0 ||
    criteria.originalsOnly ||
    criteria.priceBucket !== null ||
    criteria.durationBucket !== null ||
    criteria.sort !== DEFAULT_SORT
  );
}

/**
 * Half-open price-bucket predicate. Returns true when the given SAR
 * price belongs to the bucket (each bucket excludes its upper bound
 * so every price has exactly one home).
 */
function inPriceBucket(priceSar: number, bucket: PriceBucket): boolean {
  switch (bucket) {
    case 'under-200':
      return priceSar < 200;
    case '200-500':
      return priceSar >= 200 && priceSar < 500;
    case '500-1000':
      return priceSar >= 500 && priceSar < 1000;
    case 'over-1000':
      return priceSar >= 1000;
  }
}

function inDurationBucket(minutes: number, bucket: DurationBucket): boolean {
  switch (bucket) {
    case 'under-2h':
      return minutes < 120;
    case '2-4h':
      return minutes >= 120 && minutes < 240;
    case 'half-day':
      return minutes >= 240 && minutes < 360;
    case 'full-day':
      return minutes >= 360;
  }
}

/**
 * Substring match across both locales' titles and the place name. Case
 * folded; no diacritics handling yet — that's a Meilisearch concern
 * (BRIEF §5) and not solvable for Arabic without ICU.
 */
function matchesQuery(experience: ExperienceSummary, q: string): boolean {
  if (!q) return true;
  const haystack = [
    experience.titleEn,
    experience.titleAr,
    experience.placeName,
    experience.hostName,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterExperiences(
  experiences: readonly ExperienceSummary[],
  criteria: ExperienceCriteria,
): ExperienceSummary[] {
  return experiences.filter((experience) => {
    if (criteria.originalsOnly && !experience.featured) return false;
    if (criteria.categories.length > 0 && !criteria.categories.includes(experience.category)) {
      return false;
    }
    if (criteria.priceBucket && !inPriceBucket(experience.priceSar, criteria.priceBucket)) {
      return false;
    }
    if (
      criteria.durationBucket &&
      !inDurationBucket(experience.durationMinutes, criteria.durationBucket)
    ) {
      return false;
    }
    if (!matchesQuery(experience, criteria.q)) return false;
    return true;
  });
}

/**
 * Sort a list of experiences. The input order is preserved as the
 * tiebreaker, so callers can pass a list already ordered by createdAt
 * (DB path: ORDER BY created_at ASC) and "featured" / "newest" stay
 * meaningful for the sample-data path.
 */
export function sortExperiences(
  experiences: readonly ExperienceSummary[],
  sort: SortKey,
): ExperienceSummary[] {
  const out = [...experiences];
  // Capture original index for stable tiebreaks.
  const indexOf = new Map(out.map((e, i) => [e.slug, i]));
  switch (sort) {
    case 'featured':
      out.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return (indexOf.get(b.slug) ?? 0) - (indexOf.get(a.slug) ?? 0);
      });
      return out;
    case 'newest':
      // Input is ASC by createdAt — reverse for newest-first.
      out.reverse();
      return out;
    case 'priceAsc':
      out.sort((a, b) => a.priceSar - b.priceSar);
      return out;
    case 'priceDesc':
      out.sort((a, b) => b.priceSar - a.priceSar);
      return out;
  }
}
