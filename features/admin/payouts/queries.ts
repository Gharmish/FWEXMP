import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { bookings, experiences, hosts } from '@/db/schema';

/**
 * Host payouts. A host earns a payout once a booking is `completed`
 * (the experience actually happened). The payout per booking is the
 * booking total minus the platform commission for that experience
 * (commission is per-experience). We aggregate per host into "owed"
 * (host_paid_at IS NULL) and "paid" (host_paid_at set).
 *
 * Money math goes through the unit-tested `splitCommission` so the
 * dashboard, the bookings list, and payouts agree to the riyal.
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

export interface PayoutRow {
  hostId: string;
  hostName: string;
  owedSar: number;
  owedCount: number;
  paidSar: number;
  paidCount: number;
}

export async function listPayouts(): Promise<readonly PayoutRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    // Aggregate per host in SQL — one GROUP BY row per host instead of
    // hydrating every completed booking into JS (the set only grows as
    // the platform succeeds). The per-booking payout is
    // `total - round(total * clamp(bps,0..10000) / 10000)`, rounded
    // per booking then summed — identical math to `splitCommission`, so
    // payouts agrees with the dashboard and bookings list to the riyal.
    const payout = sql<number>`${bookings.totalAmount} - round(${bookings.totalAmount} * least(10000, greatest(0, ${experiences.commissionBps}))::numeric / 10000)`;
    const rows = await db
      .select({
        hostId: hosts.id,
        hostName: hosts.name,
        owedSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.hostPaidAt} is null), 0)::int`,
        owedCount: sql<number>`coalesce(count(*) filter (where ${bookings.hostPaidAt} is null), 0)::int`,
        paidSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
        paidCount: sql<number>`coalesce(count(*) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .where(eq(bookings.status, 'completed'))
      .groupBy(hosts.id, hosts.name);

    // One row per host — bounded by host count, so sorting in JS is cheap.
    // Owed-first (most pressing), then by name for stable ordering.
    return [...rows].sort((a, b) => b.owedSar - a.owedSar || a.hostName.localeCompare(b.hostName));
  } catch (error) {
    reportError(error, { surface: 'admin:listPayouts' });
    return [];
  }
}
