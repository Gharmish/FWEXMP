import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { bookings, experiences, guests, hostApplications } from '@/db/schema';

/**
 * Lightweight aggregate for the admin landing page. A handful of cheap
 * COUNT/SUM round-trips (no row scan into JS) so the operator's first
 * screen is headline KPIs + a live "what needs me now" queue, not a
 * static link menu.
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

export interface AdminDashboard {
  gmvAllTimeSar: number;
  bookingsTotal: number;
  guests: number;
  activeExperiences: number;
  queue: {
    pendingApplications: number;
    pendingReview: number;
    changesRequested: number;
    pendingBookings: number;
    upcomingBookings: number;
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const [bookingRow, guestRow, expRow, appRow] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          // GMV excludes refunded bookings (mirrors the analytics view).
          gmv: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} <> 'refunded'), 0)::int`,
          pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
          upcoming: sql<number>`count(*) filter (where ${bookings.date} >= current_date and ${bookings.status} in ('pending','confirmed'))::int`,
        })
        .from(bookings),
      db.select({ n: sql<number>`count(*)::int` }).from(guests),
      db
        .select({
          active: sql<number>`count(*) filter (where ${experiences.status} = 'live')::int`,
          pendingReview: sql<number>`count(*) filter (where ${experiences.status} = 'pending_review')::int`,
          changesRequested: sql<number>`count(*) filter (where ${experiences.status} = 'changes_requested')::int`,
        })
        .from(experiences),
      db
        .select({
          n: sql<number>`count(*) filter (where ${hostApplications.status} = 'pending')::int`,
        })
        .from(hostApplications),
    ]);

    return {
      gmvAllTimeSar: bookingRow[0]?.gmv ?? 0,
      bookingsTotal: bookingRow[0]?.total ?? 0,
      guests: guestRow[0]?.n ?? 0,
      activeExperiences: expRow[0]?.active ?? 0,
      queue: {
        pendingApplications: appRow[0]?.n ?? 0,
        pendingReview: expRow[0]?.pendingReview ?? 0,
        changesRequested: expRow[0]?.changesRequested ?? 0,
        pendingBookings: bookingRow[0]?.pending ?? 0,
        upcomingBookings: bookingRow[0]?.upcoming ?? 0,
      },
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getAdminDashboard' });
    return null;
  }
}
