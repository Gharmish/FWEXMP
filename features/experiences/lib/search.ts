import type { Category } from '@/lib/colors';
import type { ExperienceSummary } from '@/features/experiences/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

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
export const SORT_KEYS = ['featured', 'newest', 'priceAsc', 'priceDesc', 'ratingDesc'] as const;
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

/**
 * When-to-go presets. The catalog only knows each experience's recurring
 * weekly schedule (`availabilityWeekdays`), so a precise calendar date
 * would over-promise (blackouts + capacity are a detail-page/DB concern).
 * Honest presets map onto that weekly schedule instead: KSA weekend is
 * Friday + Saturday, the working week is Sunday–Thursday. `null` = any day.
 */
export const DAY_PRESETS = ['weekend', 'weekday'] as const;
export type DayPreset = (typeof DAY_PRESETS)[number];

/** JS weekday sets per preset (`getUTCDay()`: 0=Sun … 6=Sat). */
const PRESET_WEEKDAYS: Record<DayPreset, readonly number[]> = {
  weekend: [5, 6],
  weekday: [0, 1, 2, 3, 4],
};

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
  /** Operating city, lower-cased ('' = all cities). Abha-only at launch. */
  city: string;
  /**
   * When-to-go preset, or null for any day. Keeps experiences whose weekly
   * schedule runs on at least one day in the preset's weekday set.
   */
  dayPreset: DayPreset | null;
  /** Minimum group capacity, or null. Keeps experiences with room for N. */
  groupSize: number | null;
  sort: SortKey;
}

export const EMPTY_CRITERIA: ExperienceCriteria = {
  q: '',
  categories: [],
  originalsOnly: false,
  priceBucket: null,
  durationBucket: null,
  city: '',
  dayPreset: null,
  groupSize: null,
  sort: DEFAULT_SORT,
};

/** Group-size filter ceiling — mirrors the largest maxGroupSize we allow. */
const GROUP_SIZE_MAX = 50;

/** Brand-fixed category keys — keep in sync with the schema enum. */
const VALID_CATEGORIES: readonly Category[] = [
  'nature',
  'heritage',
  'food',
  'wellness',
  'adventure',
  'family',
  'women_only',
];

const VALID_SORTS = new Set<SortKey>(SORT_KEYS);
const VALID_PRICE_BUCKETS = new Set<PriceBucket>(PRICE_BUCKETS);
const VALID_DURATION_BUCKETS = new Set<DurationBucket>(DURATION_BUCKETS);
const VALID_DAY_PRESETS = new Set<DayPreset>(DAY_PRESETS);

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

  const dayRaw = asString(searchParams.day).trim() as DayPreset;
  const dayPreset = VALID_DAY_PRESETS.has(dayRaw) ? dayRaw : null;

  const groupRaw = Number.parseInt(asString(searchParams.group).trim(), 10);
  const groupSize =
    Number.isFinite(groupRaw) && groupRaw >= 1 ? Math.min(groupRaw, GROUP_SIZE_MAX) : null;

  return {
    q: asString(searchParams.q).trim().toLowerCase(),
    categories,
    originalsOnly: asString(searchParams.originals) === '1',
    priceBucket,
    durationBucket,
    city: asString(searchParams.city).trim().toLowerCase(),
    dayPreset,
    groupSize,
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
  if (criteria.city) params.set('city', criteria.city);
  if (criteria.dayPreset) params.set('day', criteria.dayPreset);
  if (criteria.groupSize !== null) params.set('group', String(criteria.groupSize));
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
    criteria.city.length > 0 ||
    criteria.dayPreset !== null ||
    criteria.groupSize !== null ||
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
 * Orthography fold for free-text matching, applied to BOTH the haystack
 * and the query so the lazy spellings guests actually type still match:
 * strips Arabic diacritics (U+064B–U+065F) and tatweel, folds the
 * hamza-carrying alefs (أ/إ/آ) to bare alef, ta marbuta (ة) to ha, alef
 * maqsura (ى) to ya, and lower-cases Latin. Pure and exported so tests
 * (and any future SQL push-down) share the exact same rules.
 */
export function foldSearchText(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .toLowerCase();
}

/**
 * Substring match across both locales' titles, place and host names.
 * placeName/hostName are stored as English DB strings but the Arabic UI
 * displays them via {@link toArabicText}, so both forms go into the
 * haystack — typing exactly what the card shows must match.
 */
function matchesQuery(experience: FilterableExperience, q: string): boolean {
  if (!q) return true;
  const haystack = foldSearchText(
    [
      experience.titleEn,
      experience.titleAr,
      experience.placeName,
      toArabicText(experience.placeName),
      experience.hostName,
      toArabicText(experience.hostName),
    ].join(' '),
  );
  return haystack.includes(foldSearchText(q));
}

/**
 * Structural subset of an experience the filter predicate reads. Kept
 * separate from {@link ExperienceSummary} so the client filter sheet can
 * count matches from a lightweight projection (no need to ship every card
 * field) while `filterExperiences` still passes full summaries.
 */
export interface FilterableExperience {
  category: Category;
  priceSar: number;
  durationMinutes: number;
  city: string;
  maxGroupSize: number;
  availabilityWeekdays: readonly number[];
  featured: boolean;
  titleEn: string;
  titleAr: string;
  placeName: string;
  hostName: string;
}

/**
 * The single source of truth for "does this experience match these
 * criteria". Both the server list ({@link filterExperiences}) and the
 * client sheet's live result count call this, so the count can never drift
 * from what the grid actually shows.
 */
export function matchesCriteria(
  experience: FilterableExperience,
  criteria: ExperienceCriteria,
): boolean {
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
  if (criteria.city && experience.city.toLowerCase() !== criteria.city) return false;
  if (criteria.groupSize !== null && experience.maxGroupSize < criteria.groupSize) return false;
  if (criteria.dayPreset) {
    const days = PRESET_WEEKDAYS[criteria.dayPreset];
    if (!experience.availabilityWeekdays.some((d) => days.includes(d))) return false;
  }
  if (!matchesQuery(experience, criteria.q)) return false;
  return true;
}

export function filterExperiences(
  experiences: readonly ExperienceSummary[],
  criteria: ExperienceCriteria,
): ExperienceSummary[] {
  return experiences.filter((experience) => matchesCriteria(experience, criteria));
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
    case 'ratingDesc':
      // Rated experiences first (highest average → lowest), unrated
      // sink to the bottom. Among same-rating rows, Array.sort is
      // stable in every engine we ship to, so insertion order holds.
      out.sort((a, b) => {
        const aRated = a.ratingAverage !== null;
        const bRated = b.ratingAverage !== null;
        if (aRated !== bRated) return aRated ? -1 : 1;
        if (!aRated) return 0;
        return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
      });
      return out;
  }
}
