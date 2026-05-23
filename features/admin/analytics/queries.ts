import { count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, hostApplications, hosts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import type {
  AnalyticsSnapshot,
  AnalyticsTopExperience,
  AnalyticsTopHost,
  AnalyticsWindowStats,
  CatalogTotals,
  SparklinePoint,
} from '@/features/admin/analytics/types';

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

export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db';
}

async function adminGuard(): Promise<AdminGuardFailure | null> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) return { reason: 'not_admin' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}

interface BookingForAggregation {
  id: string;
  guestId: string;
  experienceId: string;
  totalAmount: number;
  status: (typeof bookings.$inferSelect)['status'];
  createdAt: Date;
  experienceTitleEn: string;
  experienceSlug: string;
  hostId: string;
  hostName: string;
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

function statsForWindow(
  rows: readonly BookingForAggregation[],
  cutoff: Date | null,
): AnalyticsWindowStats {
  const inWindow = cutoff ? rows.filter((r) => r.createdAt.getTime() >= cutoff.getTime()) : rows;
  const out = emptyWindow();
  const guestSet = new Set<string>();
  const experienceSet = new Set<string>();
  let refundedSar = 0;
  for (const row of inWindow) {
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
        out.refunded++;
        refundedSar += row.totalAmount;
        break;
    }
  }
  out.gmvSar = Math.max(0, out.gmvSar - refundedSar);
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
    } else if (row.status === 'refunded') {
      bucket.gmvSar = Math.max(0, bucket.gmvSar - row.totalAmount);
    }
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
  const [hostCount, publishedCount, pendingReviewCount, changesCount, pendingAppsCount] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(hosts)
        .then((r) => r[0]?.n ?? 0),
      db
        .select({ n: count() })
        .from(experiences)
        .where(inArray(experiences.status, ['live', 'paused']))
        .then((r) => r[0]?.n ?? 0),
      db
        .select({ n: count() })
        .from(experiences)
        .where(eq(experiences.status, 'pending_review'))
        .then((r) => r[0]?.n ?? 0),
      db
        .select({ n: count() })
        .from(experiences)
        .where(eq(experiences.status, 'changes_requested'))
        .then((r) => r[0]?.n ?? 0),
      db
        .select({ n: count() })
        .from(hostApplications)
        .where(eq(hostApplications.status, 'pending'))
        .then((r) => r[0]?.n ?? 0),
    ]);
  return {
    hosts: hostCount,
    publishedExperiences: publishedCount,
    pendingReview: pendingReviewCount,
    changesRequested: changesCount,
    pendingApplications: pendingAppsCount,
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
        experienceTitleEn: experiences.titleEn,
        experienceSlug: experiences.slug,
        hostId: hosts.id,
        hostName: hosts.name,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .orderBy(sql`${bookings.createdAt} desc`);

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
