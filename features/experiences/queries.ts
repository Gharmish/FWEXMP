import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
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

function toSummary(
  row: ExperienceWithHost,
  ratings: Map<string, ReviewAggregate>,
): ExperienceSummary {
  const agg = ratings.get(row.slug);
  return {
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    category: row.category,
    priceSar: row.priceSar,
    durationMinutes: row.durationMinutes,
    placeName: row.placeName,
    hostName: row.host.name,
    featured: row.featured,
    ratingAverage: agg?.average ?? null,
    ratingCount: agg?.count ?? 0,
    heroImage: row.heroImage,
  };
}

function toHostInfo(host: Host): HostInfo {
  return {
    name: host.name,
    bioEn: host.bioEn,
    bioAr: host.bioAr,
    verified: host.verificationStatus === 'verified',
    photoUrl: host.photoUrl,
  };
}

function toMomentInfo(m: Moment): MomentInfo {
  return {
    orderIndex: m.orderIndex,
    timeOfDay: m.timeOfDay ?? '',
    titleEn: m.titleEn,
    titleAr: m.titleAr,
    descriptionEn: m.descriptionEn,
    descriptionAr: m.descriptionAr,
  };
}

function toDetail(
  row: ExperienceWithDetail,
  ratings: Map<string, ReviewAggregate>,
): ExperienceDetail {
  return {
    ...toSummary(row, ratings),
    city: row.city,
    region: row.region,
    minAge: row.minAge,
    maxGroupSize: row.maxGroupSize,
    inclusions: row.inclusions,
    whatToBring: row.whatToBring,
    cancellationPolicy: row.cancellationPolicy,
    host: toHostInfo(row.host),
    moments: [...row.moments].sort((a, b) => a.orderIndex - b.orderIndex).map(toMomentInfo),
    images: row.images,
  };
}

export async function getExperiences(): Promise<readonly ExperienceSummary[]> {
  if (!hasDb()) return sample.getExperiences();
  const [rows, ratings] = await Promise.all([
    db.query.experiences.findMany({
      where: (e) => eq(e.status, 'live'),
      with: { host: true },
      orderBy: (e) => asc(e.createdAt),
    }),
    getRatingsBySlug(),
  ]);
  return rows.map((row) => toSummary(row, ratings));
}

export async function getFeaturedExperiences(): Promise<readonly ExperienceSummary[]> {
  if (!hasDb()) return sample.getFeaturedExperiences();
  const [rows, ratings] = await Promise.all([
    db.query.experiences.findMany({
      where: (e) => and(eq(e.status, 'live'), eq(e.featured, true)),
      with: { host: true },
      orderBy: (e) => asc(e.createdAt),
    }),
    getRatingsBySlug(),
  ]);
  return rows.map((row) => toSummary(row, ratings));
}

export async function getExperienceBySlug(slug: string): Promise<ExperienceDetail | undefined> {
  if (!hasDb()) return sample.getExperienceBySlug(slug);
  const [row, ratings] = await Promise.all([
    db.query.experiences.findFirst({
      where: (e) => and(eq(e.slug, slug), eq(e.status, 'live')),
      with: { host: true, moments: true },
    }),
    getRatingsBySlug(),
  ]);
  return row ? toDetail(row, ratings) : undefined;
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
  const rows = await db.query.experiences.findMany({
    where: (e) => eq(e.status, 'live'),
    columns: { slug: true },
  });
  return rows.map((r) => r.slug);
}
