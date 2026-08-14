import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { EXPERIENCES_CACHE_TAG, REVIEWS_CACHE_TAG } from '@/lib/cache-tags';
import { reportError } from '@/lib/log';
import type { Experience, Host, Moment } from '@/db/schema';
import type {
  ExperienceDetail,
  ExperienceSummary,
  HostInfo,
  MomentInfo,
} from '@/features/experiences/types';
import * as sample from '@/features/experiences/lib/sample-data';
import {
  filterExperiences,
  sortExperiences,
  type ExperienceCriteria,
} from '@/features/experiences/lib/search';
import { getRatingsBySlug } from '@/features/reviews/queries';
import type { ReviewAggregate } from '@/features/reviews/types';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { isArPlaceholder } from '@/lib/ar-placeholder';

/**
 * Experience data access. These are the swap-in replacements for the
 * `sample-data` getters (see that file's SWAP POINT note) — identical
 * signatures, just async.
 *
 * When `DATABASE_URL` is unset we transparently fall back to the in-repo
 * sample dataset, so dev and CI builds stay green offline (mirroring the
 * lazy, never-throw philosophy of lib/db.ts). When it is set, every
 * getter reads live rows via Drizzle, restricted to `status = 'live'`.
 *
 * Page code only depends on these signatures, so the fallback is invisible
 * to callers.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

type ExperienceWithHost = Experience & { host: Host };
type ExperienceWithDetail = ExperienceWithHost & { moments: Moment[] };

/** "New" badge thresholds (owner-approved 2026-06-11). */
const NEW_LISTING_MAX_AGE_DAYS = 30;
const NEW_LISTING_MAX_REVIEWS = 3;

function isNewListing(createdAt: Date, reviewCount: number): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return (
    ageMs < NEW_LISTING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 && reviewCount < NEW_LISTING_MAX_REVIEWS
  );
}

/**
 * Sanitize a bilingual pair at the data layer (2026-07 audit M4): if the
 * Arabic column still holds the `TODO(ar)` scaffolding marker, callers
 * get the English text in the Arabic slot instead. The safety property
 * used to live only in `pickLocalized`, but ~120 call sites (including
 * generateMetadata → <title>/OG tags, and the owner-preview path that
 * bypasses the moderation gate) pick fields with raw ternaries —
 * enforcing here means no placeholder can leave this module regardless
 * of how the caller picks.
 */
function arOrFallback(en: string, ar: string): string {
  return isArPlaceholder(ar) ? en : ar;
}

function toSummary(
  row: ExperienceWithHost,
  ratings: Map<string, ReviewAggregate>,
): ExperienceSummary {
  const agg = ratings.get(row.slug);
  return {
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: arOrFallback(row.titleEn, row.titleAr),
    descriptionEn: row.descriptionEn,
    descriptionAr: arOrFallback(row.descriptionEn, row.descriptionAr),
    category: row.category,
    priceSar: row.priceSar,
    durationMinutes: row.durationMinutes,
    startTime: row.startTime,
    placeName: row.placeName,
    city: row.city,
    maxGroupSize: row.maxGroupSize,
    availabilityWeekdays: [...row.availabilityWeekdays],
    hostName: row.host.name,
    hostSlug: row.host.slug,
    hostVerified: row.host.verificationStatus === 'verified',
    featured: row.featured,
    bookingMode: row.bookingMode,
    ratingAverage: agg?.average ?? null,
    ratingCount: agg?.count ?? 0,
    heroImage: row.heroImage,
    images: row.images,
    isNew: isNewListing(row.createdAt, agg?.count ?? 0),
  };
}

function toHostInfo(host: Host): HostInfo {
  return {
    name: host.name,
    slug: host.slug,
    bioEn: host.bioEn,
    bioAr: arOrFallback(host.bioEn, host.bioAr),
    verified: host.verificationStatus === 'verified',
    verifiedAt: host.createdAt.toISOString(),
    photoUrl: host.photoUrl,
    languages: [...host.languages],
  };
}

function toMomentInfo(m: Moment): MomentInfo {
  return {
    orderIndex: m.orderIndex,
    timeOfDay: m.timeOfDay ?? '',
    titleEn: m.titleEn,
    titleAr: arOrFallback(m.titleEn, m.titleAr),
    descriptionEn: m.descriptionEn,
    descriptionAr: arOrFallback(m.descriptionEn, m.descriptionAr),
  };
}

function toDetail(
  row: ExperienceWithDetail,
  ratings: Map<string, ReviewAggregate>,
): ExperienceDetail {
  return {
    ...toSummary(row, ratings),
    region: row.region,
    minAge: row.minAge,
    lat: row.lat,
    lng: row.lng,
    inclusions: row.inclusions,
    whatToBring: row.whatToBring,
    inclusionsAr: row.inclusionsAr,
    whatToBringAr: row.whatToBringAr,
    cancellationPolicy: row.cancellationPolicy,
    cancellationTier: row.cancellationTier,
    // Optional editorial story — same placeholder guard as every other
    // Arabic column; null until real content is written (never fabricated).
    storyEn: row.storyEn,
    storyAr: row.storyAr !== null && !isArPlaceholder(row.storyAr) ? row.storyAr : row.storyEn,
    host: toHostInfo(row.host),
    moments: [...row.moments].sort((a, b) => a.orderIndex - b.orderIndex).map(toMomentInfo),
    images: row.images,
  };
}

/**
 * The live catalog (summaries + embedded ratings), cached across
 * requests. Public and identical for every visitor, so the 60s window
 * is safe; content writes call `revalidateExperienceCaches()` /
 * `revalidateReviewCaches()` for instant freshness. Tagged with BOTH
 * tags because the summaries embed rating count/average. `undefined`
 * is not JSON-round-trip-safe, hence the plain-array return.
 *
 * Before this cache the full live set (with host join + the global
 * ratings aggregate) hydrated up to 3× per catalog request — see the
 * 2026-07 audit (C2). The in-JS filtering downstream is a separate,
 * deliberate launch-scale tradeoff (`getExperiencesFiltered`).
 */
const loadLiveSummaries = unstable_cache(
  async (): Promise<ExperienceSummary[]> => {
    // boundedQuery converts a poisoned-pooler hang into a bounded throw —
    // a thrown load is never cached, so the next request retries. The
    // ratings arm is NOT wrapped: getRatingsBySlug is bounded internally
    // and degrades to empty on failure.
    const [rows, ratings] = await Promise.all([
      boundedQuery('experiences:liveSummaries', () =>
        db.query.experiences.findMany({
          where: (e) => eq(e.status, 'live'),
          with: { host: true },
          orderBy: (e) => asc(e.createdAt),
        }),
      ),
      getRatingsBySlug(),
    ]);
    return rows.map((row) => toSummary(row, ratings));
  },
  ['live-experience-summaries'],
  { revalidate: 60, tags: [EXPERIENCES_CACHE_TAG, REVIEWS_CACHE_TAG] },
);

export const getExperiences = cache(async (): Promise<readonly ExperienceSummary[]> => {
  if (!hasDb()) return sample.getExperiences();
  return loadLiveSummaries();
});

export const getFeaturedExperiences = cache(async (): Promise<readonly ExperienceSummary[]> => {
  if (!hasDb()) return sample.getFeaturedExperiences();
  // Derived from the shared cached load — featured is a subset of live,
  // so a second DB query (and second cache entry) would buy nothing.
  // `createdAt asc` ordering survives the filter.
  return (await getExperiences()).filter((e) => e.featured);
});

/**
 * Per-slug live detail, cached across requests (the slug is part of the
 * cache key). `generateMetadata` and the page body both call
 * `getExperienceBySlug`, and booking emails re-render from it too — the
 * React `cache()` wrapper dedupes within a request, this entry dedupes
 * across them. Returns null (not undefined) inside the cached fn:
 * undefined does not survive the cache's JSON round-trip.
 */
const loadDetailBySlug = unstable_cache(
  async (slug: string): Promise<ExperienceDetail | null> => {
    const [row, ratings] = await Promise.all([
      boundedQuery('experiences:detailBySlug', () =>
        db.query.experiences.findFirst({
          where: (e) => and(eq(e.slug, slug), eq(e.status, 'live')),
          with: { host: true, moments: true },
        }),
      ),
      getRatingsBySlug(),
    ]);
    return row ? toDetail(row, ratings) : null;
  },
  ['experience-detail'],
  { revalidate: 60, tags: [EXPERIENCES_CACHE_TAG, REVIEWS_CACHE_TAG] },
);

export const getExperienceBySlug = cache(
  async (slug: string): Promise<ExperienceDetail | undefined> => {
    if (!hasDb()) return sample.getExperienceBySlug(slug);
    return (await loadDetailBySlug(slug)) ?? undefined;
  },
);

/**
 * Any-status detail read for the owner's pre-publish preview
 * (`/experiences/[slug]?preview=1`). Gated hard: only the listing's own
 * host (via `hosts.userId`) or an admin gets a row back — everyone else
 * sees the same `undefined` a missing slug produces, so drafts stay
 * invisible and slugs can't be probed.
 */
export async function getExperienceBySlugForOwnerPreview(
  slug: string,
): Promise<ExperienceDetail | undefined> {
  if (!hasDb()) return undefined;
  const user = await getCurrentUser();
  if (!user) return undefined;
  try {
    const [row, ratings] = await Promise.all([
      boundedQuery('experiences:ownerPreview', () =>
        db.query.experiences.findFirst({
          where: (e) => eq(e.slug, slug),
          with: { host: true, moments: true },
        }),
      ),
      getRatingsBySlug(),
    ]);
    if (!row) return undefined;
    if (!isAdminUser(user) && row.host.userId !== user.id) return undefined;
    return toDetail(row, ratings);
  } catch (error) {
    reportError(error, { surface: 'experiences:ownerPreview', slug });
    return undefined;
  }
}

/**
 * Catalog-with-filters accessor. Loads the live set through the same
 * path as `getExperiences()`, then applies the criteria + sort in JS.
 * At launch scale (single-digit to low-double-digit rows) this is
 * cheaper than per-request WHERE/ORDER BY planning and keeps the DB
 * and sample-data paths byte-identical.
 */
export async function getExperiencesFiltered(
  criteria: ExperienceCriteria,
): Promise<readonly ExperienceSummary[]> {
  const all = await getExperiences();
  return sortExperiences(filterExperiences(all, criteria), criteria.sort);
}

export async function getAllSlugs(): Promise<string[]> {
  if (!hasDb()) return sample.getAllSlugs();
  // Called from generateStaticParams at BUILD time — a transient pooler
  // refusal must degrade to [] (pages then render on demand via
  // dynamicParams) instead of failing the whole deployment. This took
  // down six consecutive Vercel builds on 2026-06-10.
  try {
    const rows = await db.query.experiences.findMany({
      where: (e) => eq(e.status, 'live'),
      columns: { slug: true },
    });
    return rows.map((r) => r.slug);
  } catch (error) {
    reportError(error, { surface: 'experiences:getAllSlugs' });
    return [];
  }
}
