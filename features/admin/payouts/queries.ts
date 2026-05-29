import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { bookings, experiences, hosts } from '@/db/schema';
import { splitCommission } from '@/features/bookings/lib/availability';

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
    const rows = await db
      .select({
        hostId: hosts.id,
        hostName: hosts.name,
        totalAmount: bookings.totalAmount,
        commissionBps: experiences.commissionBps,
        hostPaidAt: bookings.hostPaidAt,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .where(eq(bookings.status, 'completed'));

    const byHost = new Map<string, PayoutRow>();
    for (const row of rows) {
      const { payoutSar } = splitCommission(row.totalAmount, row.commissionBps);
      const existing =
        byHost.get(row.hostId) ??
        ({
          hostId: row.hostId,
          hostName: row.hostName,
          owedSar: 0,
          owedCount: 0,
          paidSar: 0,
          paidCount: 0,
        } satisfies PayoutRow);
      if (row.hostPaidAt) {
        existing.paidSar += payoutSar;
        existing.paidCount += 1;
      } else {
        existing.owedSar += payoutSar;
        existing.owedCount += 1;
      }
      byHost.set(row.hostId, existing);
    }

    // Owed-first (most pressing), then by name for stable ordering.
    return [...byHost.values()].sort(
      (a, b) => b.owedSar - a.owedSar || a.hostName.localeCompare(b.hostName),
    );
  } catch (error) {
    reportError(error, { surface: 'admin:listPayouts' });
    return [];
  }
}
