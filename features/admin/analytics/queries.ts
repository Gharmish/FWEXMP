import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, experiences, hostApplications, hosts } from '@/db/schema';

/** Hard ceiling on the bookings load — a safety brake so a misconfigured
 * prod that suddenly grew past the in-memory threshold doesn't render
 * `/admin/analytics` for minutes. When we cross this, promote the
 * aggregations into SQL FILTER clauses (see the file docstring). */
const BOOKINGS_QUERY_LIMIT = 50_000;
import { reportError } from '@/lib/log';
import type {
  AnalyticsSnapshot,
  AnalyticsTopExperience,
  AnalyticsTopHost,
  AnalyticsWindowStats,
  CatalogTotals,
  SparklinePoint,
} from '@/features/admin/analytics/types';
import { adminGuard } from '@/features/admin/guard';

/**
 * Admin analytics. Same guard chassis as the other admin surfaces.
 *
 * Aggregation strategy: load the bookings dataset once (joined to
 * experience + host for naming), then derive every window / breakdown
 * in JS. At launch scale this is cheaper than per-window SQL planning
 * and keeps the code one screen long.
 *
 * Promotion path: when bookings cross ~10k rows, push the aggregations
 * into SQL with FILTER clauses and indexed `created_at`. The shape
 * returned by `getAnalyticsSnapshot` doesn't need to change.
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export interface BookingForAggregation {
  id: string;
  guestId: string;
  experienceId: string;
  totalAmount: number;
  status: (typeof bookings.$inferSelect)['status'];
  createdAt: Date;
  /** Set when the admin recorded a refund; null otherwise. */
  refundedAt: Date | null;
  experienceTitleEn: string;
  experienceSlug: string;
  hostId: string;
  hostName: string;
}

/**
 * Which timestamp should this row be windowed by? Refunds use the
 * refund time so a 60-day-old booking refunded today shows up in
 * `last7d.refunded`. Legacy rows that were already `refunded` before
 * the `refundedAt` column existed fall back to `createdAt`.
 */
function windowTimestamp(row: BookingForAggregation): Date {
  if (row.status === 'refunded' && row.refundedAt) return row.refundedAt;
  return row.createdAt;
}

type RevenueStatus = 'confirmed' | 'completed';

function isRevenue(status: BookingForAggregation['status']): status is RevenueStatus {
  return status === 'confirmed' || status === 'completed';
}

function emptyWindow(): AnalyticsWindowStats {
  return {
    bookings: 0,
    pending: 0,
    cancelled: 0,
    refunded: 0,
    gmvSar: 0,
    uniqueGuests: 0,
    activeExperiences: 0,
  };
}

export function statsForWindow(
  rows: readonly BookingForAggregation[],
  cutoff: Date | null,
): AnalyticsWindowStats {
  const out = emptyWindow();
  const guestSet = new Set<string>();
  const experienceSet = new Set<string>();
  for (const row of rows) {
    // Window by the right event time — refund time for refunds,
    // booking-placed time for everything else.
    if (cutoff && windowTimestamp(row).getTime() < cutoff.getTime()) continue;
    switch (row.status) {
      case 'confirmed':
      case 'completed':
        out.bookings++;
        out.gmvSar += row.totalAmount;
        guestSet.add(row.guestId);
        experienceSet.add(row.experienceId);
        break;
      case 'pending':
        out.pending++;
        break;
      case 'cancelled':
        out.cancelled++;
        break;
      case 'refunded':
        // Refund $$ value isn't aggregated into a single field today
        // because the original revenue is already absent from `gmvSar`
        // (the confirmed/completed branch skips refunded rows). The
        // `refunded` count is enough for the dashboard; if we ever
        // need "money returned", add a `refundedSar` field here.
        out.refunded++;
        break;
    }
  }
  out.uniqueGuests = guestSet.size;
  out.activeExperiences = experienceSet.size;
  return out;
}

function sparkline(rows: readonly BookingForAggregation[], days: number): SparklinePoint[] {
  const now = new Date();
  // Build day buckets [today-days+1 … today] inclusive.
  const buckets = new Map<string, SparklinePoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, bookings: 0, gmvSar: 0 });
  }
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  for (const row of rows) {
    if (row.createdAt.getTime() < cutoffMs) continue;
    const key = row.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (isRevenue(row.status)) {
      bucket.bookings++;
      bucket.gmvSar += row.totalAmount;
    }
    // Refunds are intentionally not subtracted here — the booking's
    // `createdAt` is when the booking was placed, not when it was
    // refunded, so subtracting against that bucket would distort the
    // sparkline. Track refunds separately once a `refundedAt` column
    // ships.
  }
  return Array.from(buckets.values());
}

function topExperiences(
  rows: readonly BookingForAggregation[],
  cutoff: Date,
  limit: number,
): AnalyticsTopExperience[] {
  const agg = new Map<string, AnalyticsTopExperience>();
  for (const row of rows) {
    if (row.createdAt.getTime() < cutoff.getTime()) continue;
    if (!isRevenue(row.status)) continue;
    const existing = agg.get(row.experienceId);
    if (existing) {
      existing.bookings++;
      existing.gmvSar += row.totalAmount;
    } else {
      agg.set(row.experienceId, {
        experienceId: row.experienceId,
        slug: row.experienceSlug,
        titleEn: row.experienceTitleEn,
        bookings: 1,
        gmvSar: row.totalAmount,
      });
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => b.gmvSar - a.gmvSar)
    .slice(0, limit);
}

function topHosts(
  rows: readonly BookingForAggregation[],
  cutoff: Date,
  limit: number,
): AnalyticsTopHost[] {
  const agg = new Map<string, AnalyticsTopHost>();
  for (const row of rows) {
    if (row.createdAt.getTime() < cutoff.getTime()) continue;
    if (!isRevenue(row.status)) continue;
    const existing = agg.get(row.hostId);
    if (existing) {
      existing.bookings++;
      existing.gmvSar += row.totalAmount;
    } else {
      agg.set(row.hostId, {
        hostId: row.hostId,
        name: row.hostName,
        bookings: 1,
        gmvSar: row.totalAmount,
      });
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => b.gmvSar - a.gmvSar)
    .slice(0, limit);
}

async function catalogTotals(): Promise<CatalogTotals> {
  // Three round-trips (down from five) — one per table. The
  // experiences row collapses three counts behind Postgres `FILTER`
  // clauses so the planner only scans the table once.
  const [hostsRow, expRow, appsRow] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(hosts),
    db
      .select({
        published: sql<number>`count(*) filter (where ${experiences.status} in ('live','paused'))::int`,
        pendingReview: sql<number>`count(*) filter (where ${experiences.status} = 'pending_review')::int`,
        changesRequested: sql<number>`count(*) filter (where ${experiences.status} = 'changes_requested')::int`,
      })
      .from(experiences),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(hostApplications)
      .where(eq(hostApplications.status, 'pending')),
  ]);
  return {
    hosts: hostsRow[0]?.n ?? 0,
    publishedExperiences: expRow[0]?.published ?? 0,
    pendingReview: expRow[0]?.pendingReview ?? 0,
    changesRequested: expRow[0]?.changesRequested ?? 0,
    pendingApplications: appsRow[0]?.n ?? 0,
  };
}

function cutoffDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    // One join over bookings → experience → host. At platform scale
    // this fits comfortably in memory; aggregations are then derived
    // in JS for clarity.
    const rows = await db
      .select({
        id: bookings.id,
        guestId: bookings.guestId,
        experienceId: bookings.experienceId,
        totalAmount: bookings.totalAmount,
        status: bookings.status,
        createdAt: bookings.createdAt,
        refundedAt: bookings.refundedAt,
        experienceTitleEn: experiences.titleEn,
        experienceSlug: experiences.slug,
        hostId: hosts.id,
        hostName: hosts.name,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .orderBy(sql`${bookings.createdAt} desc`)
      .limit(BOOKINGS_QUERY_LIMIT);

    const all = rows as BookingForAggregation[];
    const catalog = await catalogTotals();
    const cutoff7 = cutoffDaysAgo(7);
    const cutoff30 = cutoffDaysAgo(30);
    const cutoff90 = cutoffDaysAgo(90);

    return {
      generatedAt: new Date().toISOString(),
      last7d: statsForWindow(all, cutoff7),
      last30d: statsForWindow(all, cutoff30),
      last90d: statsForWindow(all, cutoff90),
      allTime: statsForWindow(all, null),
      sparkline: sparkline(all, 30),
      topExperiences30d: topExperiences(all, cutoff30, 5),
      topHosts30d: topHosts(all, cutoff30, 5),
      catalog,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getAnalyticsSnapshot' });
    return null;
  }
}
