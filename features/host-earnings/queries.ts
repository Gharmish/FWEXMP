import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { paymentCollected, payoutExpr } from '@/features/bookings/lib/payout-sql';

/**
 * Host earnings, scoped to the signed-in host (resolved from
 * `hosts.userId`, never from the URL). Mirrors the admin payouts
 * math exactly: a payout is earned when a booking is `completed` AND
 * its money was actually collected (paid online, or no online payment
 * required), computed per booking from the commission rate SNAPSHOTTED
 * on the booking (identical to `splitCommission`), then summed — so
 * the host page, the admin payouts page, and the dashboard agree to
 * the riyal, and a later commission edit never restates history.
 *
 * "Upcoming" is the projected payout over collected `confirmed`
 * bookings — money on the calendar, not yet earned. Owed/paid split on
 * `bookings.hostPaidAt` (stamped by the admin payout action).
 */

export interface HostEarningsHistoryRow {
  id: string;
  date: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  partySize: number;
  /** What the guest paid (VAT-inclusive gross). */
  totalSar: number;
  /** Platform commission withheld on this booking. */
  commissionSar: number;
  /** Commission rate applied (snapshot), basis points. */
  commissionBps: number;
  payoutSar: number;
  /** Null = completed but not yet paid out. */
  paidOutAt: string | null;
}

export interface HostEarnings {
  owedSar: number;
  owedCount: number;
  paidSar: number;
  paidCount: number;
  upcomingSar: number;
  upcomingCount: number;
  payoutIban: string | null;
  /** Completed bookings newest-first — the host's payout ledger. */
  history: readonly HostEarningsHistoryRow[];
}

/** Ledger ceiling — same launch-scale guard as the booking lists. */
const HISTORY_LIMIT = 200;

export async function getHostEarnings(): Promise<HostEarnings | null> {
  const user = await getCurrentUser();
  if (!user || !serverEnv.DATABASE_URL) return null;
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true, payoutIban: true },
    });
    if (!host) return null;

    const payout = payoutExpr();
    const collected = paymentCollected();

    const [[totals], historyRows] = await Promise.all([
      db
        .select({
          owedSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is null and ${collected}), 0)::int`,
          owedCount: sql<number>`coalesce(count(*) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is null and ${collected}), 0)::int`,
          paidSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is not null), 0)::int`,
          paidCount: sql<number>`coalesce(count(*) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is not null), 0)::int`,
          upcomingSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.status} = 'confirmed' and ${collected}), 0)::int`,
          upcomingCount: sql<number>`coalesce(count(*) filter (where ${bookings.status} = 'confirmed' and ${collected}), 0)::int`,
        })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(
          and(
            eq(experiences.hostId, host.id),
            inArray(bookings.status, ['completed', 'confirmed']),
          ),
        ),
      db
        .select({
          id: bookings.id,
          date: bookings.date,
          experienceTitleEn: experiences.titleEn,
          experienceTitleAr: experiences.titleAr,
          partySize: bookings.partySize,
          totalSar: bookings.totalAmount,
          commissionBps: bookings.commissionBps,
          payoutSar: payout,
          paidOutAt: bookings.hostPaidAt,
        })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(and(eq(experiences.hostId, host.id), eq(bookings.status, 'completed')))
        .orderBy(desc(bookings.date))
        .limit(HISTORY_LIMIT),
    ]);

    return {
      owedSar: totals?.owedSar ?? 0,
      owedCount: totals?.owedCount ?? 0,
      paidSar: totals?.paidSar ?? 0,
      paidCount: totals?.paidCount ?? 0,
      upcomingSar: totals?.upcomingSar ?? 0,
      upcomingCount: totals?.upcomingCount ?? 0,
      payoutIban: host.payoutIban,
      history: historyRows.map((row) => ({
        ...row,
        commissionSar: row.totalSar - row.payoutSar,
        paidOutAt: row.paidOutAt ? row.paidOutAt.toISOString() : null,
      })),
    };
  } catch (error) {
    reportError(error, { surface: 'host-earnings:get' });
    return null;
  }
}
