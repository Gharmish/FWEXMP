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

export interface ExperienceCriteria {
  /** Free-text query, lower-cased, trimmed. Empty string when absent. */
  q: string;
  /** Selected categories (intersection with the brand-fixed set). */
  categories: readonly Category[];
  /** When true, restrict to featured (Originals) experiences. */
  originalsOnly: boolean;
  sort: SortKey;
}

export const EMPTY_CRITERIA: ExperienceCriteria = {
  q: '',
  categories: [],
  originalsOnly: false,
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

  return {
    q: asString(searchParams.q).trim().toLowerCase(),
    categories,
    originalsOnly: asString(searchParams.originals) === '1',
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
  if (criteria.sort !== DEFAULT_SORT) params.set('sort', criteria.sort);
  return params;
}

export function hasActiveFilters(criteria: ExperienceCriteria): boolean {
  return (
    criteria.q.length > 0 ||
    criteria.categories.length > 0 ||
    criteria.originalsOnly ||
    criteria.sort !== DEFAULT_SORT
  );
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
