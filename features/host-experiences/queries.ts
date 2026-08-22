import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, reviews } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentHostRef } from '@/features/host-dashboard/queries';

/**
 * Host-scoped reads over `experiences`. Every helper resolves the
 * caller's `hosts.id` from `hosts.userId = currentUser.id` first, so
 * a host can never see (or write to) another host's experiences —
 * even by guessing an experience id in a URL.
 *
 * Stub mode: all helpers return `null` / empty arrays. There are no
 * `hosts` rows without a DB; the dashboard handles the redirect to
 * `/host/apply` long before these helpers run.
 */

export interface HostExperienceRow {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: (typeof experiences.$inferSelect)['category'];
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  /**
   * Platform commission in basis points — admin-owned, per experience.
   * Read-only for hosts; shown so the payout split is never a surprise.
   */
  commissionBps: number;
  placeName: string;
  city: string;
  region: string;
  inclusions: string[];
  inclusionsAr: string[];
  whatToBring: string[];
  whatToBringAr: string[];
  cancellationPolicy: string;
  cancellationTier: 'flexible' | 'moderate' | 'strict';
  availabilityWeekdays: number[];
  startTime: string;
  /** Hours before start that bookings close (host-settable). */
  bookingCutoffHours: number;
  lat: number;
  lng: number;
  status: (typeof experiences.$inferSelect)['status'];
  featured: boolean;
  heroImage: string | null;
  /** Gallery URLs (after the hero) — the public mosaic wants 5+. */
  images: string[];
  createdAt: string;
  updatedAt: string;
}

function rowToView(row: typeof experiences.$inferSelect): HostExperienceRow {
  return {
    id: row.id,
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    category: row.category,
    durationMinutes: row.durationMinutes,
    maxGroupSize: row.maxGroupSize,
    minAge: row.minAge,
    priceSar: row.priceSar,
    commissionBps: row.commissionBps,
    placeName: row.placeName,
    city: row.city,
    region: row.region,
    inclusions: [...row.inclusions],
    inclusionsAr: [...row.inclusionsAr],
    whatToBring: [...row.whatToBring],
    whatToBringAr: [...row.whatToBringAr],
    cancellationPolicy: row.cancellationPolicy,
    cancellationTier: row.cancellationTier,
    availabilityWeekdays: [...row.availabilityWeekdays],
    startTime: row.startTime,
    bookingCutoffHours: row.bookingCutoffHours,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    featured: row.featured,
    heroImage: row.heroImage,
    images: [...row.images],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Host id for reads — delegates to the request-memoised resolver in
 * features/host-dashboard/queries (one hosts lookup per request).
 */
async function resolveHostIdForCurrentUser(): Promise<string | null> {
  const ref = await getCurrentHostRef();
  return ref?.id ?? null;
}

/** All experiences owned by the current host, newest first. */
export async function listMyExperiences(): Promise<readonly HostExperienceRow[]> {
  const hostId = await resolveHostIdForCurrentUser();
  if (!hostId) return [];
  try {
    const rows = await db
      .select()
      .from(experiences)
      .where(eq(experiences.hostId, hostId))
      .orderBy(desc(experiences.createdAt));
    return rows.map(rowToView);
  } catch (error) {
    reportError(error, { surface: 'host-experiences:listMy' });
    return [];
  }
}

/**
 * Single experience by id, only if it belongs to the current host.
 * Returns `null` for not-found AND for foreign rows — never leak
 * "this id exists but you can't see it" via the response.
 */
export async function getMyExperienceById(id: string): Promise<HostExperienceRow | null> {
  const hostId = await resolveHostIdForCurrentUser();
  if (!hostId) return null;
  try {
    const row = await db.query.experiences.findFirst({
      where: (e) => and(eq(e.id, id), eq(e.hostId, hostId)),
    });
    return row ? rowToView(row) : null;
  } catch (error) {
    reportError(error, { surface: 'host-experiences:getMy', experienceId: id });
    return null;
  }
}

/**
 * Returns the host id linked to the current user, for use in actions.
 * Exposed so the action layer can scope writes without re-deriving.
 *
 * SUSPENDED hosts resolve to null here (2026-07-28 audit): every write
 * path funnels through this helper, and photo replacement, day
 * blackouts/stop-sells, and duplication used to stay open after a
 * suspension while bookings and publishing were already refused. Reads
 * (dashboard, lists) keep using the status-blind resolver so a
 * suspended host can still see their own data.
 */
export async function getCurrentHostIdForWrite(): Promise<string | null> {
  if (!serverEnv.DATABASE_URL) return null;
  const ref = await getCurrentHostRef();
  if (!ref || ref.verificationStatus === 'suspended') return null;
  return ref.id;
}

/**
 * Ordered timeline for the host's own experience — same row shape the
 * shared moments editor consumes. Foreign/missing experiences return
 * [] (the page 404s before rendering the editor anyway).
 */
export async function getMyExperienceMoments(
  experienceId: string,
): Promise<import('@/features/admin/experiences/queries').AdminMoment[]> {
  const hostId = await resolveHostIdForCurrentUser();
  if (!hostId) return [];
  try {
    const owned = await db.query.experiences.findFirst({
      where: (e) => and(eq(e.id, experienceId), eq(e.hostId, hostId)),
      columns: { id: true },
    });
    if (!owned) return [];
    const rows = await db.query.moments.findMany({
      where: (m) => eq(m.experienceId, experienceId),
      orderBy: (m) => [m.orderIndex],
    });
    return rows.map((m) => ({
      id: m.id,
      orderIndex: m.orderIndex,
      timeOfDay: m.timeOfDay,
      titleEn: m.titleEn,
      titleAr: m.titleAr,
      descriptionEn: m.descriptionEn,
      descriptionAr: m.descriptionAr,
    }));
  } catch (error) {
    reportError(error, { surface: 'host-experiences:getMoments', experienceId });
    return [];
  }
}

/** Per-listing signal for the host's listings index (2026-08-22 audit P2-5). */
export interface HostListingStats {
  /** Confirmed/completed bookings with a date in the trailing 30 days. */
  bookings30d: number;
  ratingAverage: number | null;
  ratingCount: number;
}

/**
 * Bookings-in-the-last-30-days and rating per listing, keyed by
 * experience id — two grouped queries, not one per row.
 */
export async function getMyListingStats(): Promise<ReadonlyMap<string, HostListingStats>> {
  const hostId = await resolveHostIdForCurrentUser();
  const stats = new Map<string, HostListingStats>();
  if (!hostId) return stats;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const [bookingRows, ratingRows] = await Promise.all([
      db
        .select({ experienceId: bookings.experienceId, n: sql<number>`count(*)::int` })
        .from(bookings)
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .where(
          and(
            eq(experiences.hostId, hostId),
            sql`${bookings.status} in ('confirmed', 'completed')`,
            gte(bookings.date, since),
          ),
        )
        .groupBy(bookings.experienceId),
      db
        .select({
          experienceId: reviews.experienceId,
          avg: sql<string | null>`avg(${reviews.rating})`,
          n: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .innerJoin(experiences, eq(reviews.experienceId, experiences.id))
        .where(and(eq(experiences.hostId, hostId), isNull(reviews.hiddenAt)))
        .groupBy(reviews.experienceId),
    ]);
    for (const row of bookingRows) {
      stats.set(row.experienceId, { bookings30d: row.n, ratingAverage: null, ratingCount: 0 });
    }
    for (const row of ratingRows) {
      const current = stats.get(row.experienceId) ?? {
        bookings30d: 0,
        ratingAverage: null,
        ratingCount: 0,
      };
      stats.set(row.experienceId, {
        ...current,
        ratingAverage: row.avg === null ? null : Number(row.avg),
        ratingCount: row.n,
      });
    }
    return stats;
  } catch (error) {
    reportError(error, { surface: 'host-experiences:listingStats' });
    return stats;
  }
}
