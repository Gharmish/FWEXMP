import { asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import { bookings, experiences, hosts, payoutClawbacks } from '@/db/schema';
import { paymentCollected, payoutExpr } from '@/features/bookings/lib/payout-sql';
import { planClawbackDeduction } from '@/features/bookings/lib/clawback';
import { adminGuard } from '@/features/admin/guard';
import { decryptPii } from '@/lib/pii-crypto';

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

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export interface PayoutRow {
  hostId: string;
  hostName: string;
  /** Payout destination (self-managed by the host). Null = not provided. */
  payoutIban: string | null;
  /** Gross owed from completed+collected bookings not yet paid out. */
  owedSar: number;
  owedCount: number;
  /**
   * Clawback deduction the next "Mark paid" will apply (refunds issued
   * after this host was already paid out — greedy oldest-first plan,
   * identical to the one `markHostPaid` executes).
   */
  clawbackSar: number;
  /** What the transfer will actually be: `owedSar − clawbackSar`. */
  netOwedSar: number;
  paidSar: number;
  paidCount: number;
}

export async function listPayouts(): Promise<readonly PayoutRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    // Aggregate per host in SQL — one GROUP BY row per host instead of
    // hydrating every completed booking into JS (the set only grows as
    // the platform succeeds). The per-booking payout comes from the
    // commission SNAPSHOT on the booking (identical to
    // `splitCommission`), so payouts agrees with the dashboard, the
    // bookings list, and the host's earnings page to the riyal — and a
    // commission edit never restates history. "Owed" additionally
    // requires the money to have been collected (paid online, or no
    // online payment required).
    const payout = payoutExpr();
    const rows = await db
      .select({
        hostId: hosts.id,
        hostName: hosts.name,
        payoutIban: hosts.payoutIban,
        owedSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.hostPaidAt} is null and ${paymentCollected()}), 0)::int`,
        owedCount: sql<number>`coalesce(count(*) filter (where ${bookings.hostPaidAt} is null and ${paymentCollected()}), 0)::int`,
        paidSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
        paidCount: sql<number>`coalesce(count(*) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      // Refunded-after-payout rows stay in the scan (2026-07-20 audit):
      // "paid to date" is keyed on `hostPaidAt` so it keeps matching the
      // recorded payout statements; the reversal appears as a clawback.
      .where(sql`(${bookings.status} = 'completed' or ${bookings.hostPaidAt} is not null)`)
      .groupBy(hosts.id, hosts.name, hosts.payoutIban);

    // Pending clawbacks (refund-after-payout reversals) — planned per
    // host with the SAME greedy oldest-first rule `markHostPaid`
    // executes, so the net the admin sees is the net the action pays.
    const pendingClawbacks = await db
      .select({
        id: payoutClawbacks.id,
        hostId: payoutClawbacks.hostId,
        amountSar: payoutClawbacks.amountSar,
      })
      .from(payoutClawbacks)
      .where(isNull(payoutClawbacks.settledPayoutId))
      .orderBy(asc(payoutClawbacks.createdAt));
    const clawbacksByHost = new Map<string, { id: string; amountSar: number }[]>();
    for (const row of pendingClawbacks) {
      const list = clawbacksByHost.get(row.hostId) ?? [];
      list.push({ id: row.id, amountSar: row.amountSar });
      clawbacksByHost.set(row.hostId, list);
    }

    const withClawbacks = rows.map((row) => {
      const plan = planClawbackDeduction(row.owedSar, clawbacksByHost.get(row.hostId) ?? []);
      return {
        ...row,
        // Stored encrypted at rest; the page masks + copies the real value.
        payoutIban: decryptPii(row.payoutIban),
        clawbackSar: plan.deductedSar,
        netOwedSar: plan.netSar,
      };
    });

    // One row per host — bounded by host count, so sorting in JS is cheap.
    // Owed-first (most pressing), then by name for stable ordering.
    return withClawbacks.sort(
      (a, b) => b.netOwedSar - a.netOwedSar || a.hostName.localeCompare(b.hostName),
    );
  } catch (error) {
    reportError(error, { surface: 'admin:listPayouts' });
    return [];
  }
}
