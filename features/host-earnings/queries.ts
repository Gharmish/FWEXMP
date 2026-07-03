import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
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

export interface HostEarningsTotals {
  owedSar: number;
  owedCount: number;
  paidSar: number;
  paidCount: number;
  upcomingSar: number;
  upcomingCount: number;
}

/** One experience's completed-earnings rollup within the active range. */
export interface HostEarningsBreakdownRow {
  experienceId: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  count: number;
  payoutSar: number;
}

/** One calendar month's completed-earnings rollup within the active range. */
export interface HostEarningsMonthlyRow {
  /** `YYYY-MM`. */
  month: string;
  count: number;
  payoutSar: number;
}

/** Booking-date bounds (inclusive, `YYYY-MM-DD`) for the ledger + rollups. */
export interface HostEarningsRange {
  from?: string;
  to?: string;
}

export interface HostEarnings extends HostEarningsTotals {
  payoutIban: string | null;
  /** Completed bookings newest-first — the host's payout ledger. */
  history: readonly HostEarningsHistoryRow[];
  /** Completed earnings per experience, biggest payout first. */
  breakdown: readonly HostEarningsBreakdownRow[];
  /** Completed earnings per month, newest first (12-month window). */
  monthly: readonly HostEarningsMonthlyRow[];
}

/** Ledger ceiling — same launch-scale guard as the booking lists. */
const HISTORY_LIMIT = 200;

/** The one aggregate row behind both earnings surfaces. */
function selectEarningsTotals(hostId: string) {
  const payout = payoutExpr();
  const collected = paymentCollected();
  return db
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
      and(eq(experiences.hostId, hostId), inArray(bookings.status, ['completed', 'confirmed'])),
    );
}

/**
 * Totals only — the overview's KPI strip. Skips the 200-row ledger the
 * full `getHostEarnings` hydrates for /host/earnings.
 */
export async function getHostEarningsTotals(): Promise<HostEarningsTotals | null> {
  const user = await getCurrentUser();
  if (!user || !serverEnv.DATABASE_URL) return null;
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    if (!host) return null;
    const [totals] = await selectEarningsTotals(host.id);
    return {
      owedSar: totals?.owedSar ?? 0,
      owedCount: totals?.owedCount ?? 0,
      paidSar: totals?.paidSar ?? 0,
      paidCount: totals?.paidCount ?? 0,
      upcomingSar: totals?.upcomingSar ?? 0,
      upcomingCount: totals?.upcomingCount ?? 0,
    };
  } catch (error) {
    reportError(error, { surface: 'host-earnings:totals' });
    return null;
  }
}

export async function getHostEarnings(range?: HostEarningsRange): Promise<HostEarnings | null> {
  const user = await getCurrentUser();
  if (!user || !serverEnv.DATABASE_URL) return null;
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true, payoutIban: true },
    });
    if (!host) return null;

    const payout = payoutExpr();

    // The headline totals stay all-time (they are a status snapshot);
    // the range narrows the ledger and the two rollups only.
    const completedConds: SQL[] = [
      eq(experiences.hostId, host.id),
      eq(bookings.status, 'completed'),
    ];
    if (range?.from) completedConds.push(gte(bookings.date, range.from));
    if (range?.to) completedConds.push(lte(bookings.date, range.to));
    const completedWhere = and(...completedConds);

    const payoutSum = sql<number>`coalesce(sum(${payout}), 0)::int`;
    const rowCount = sql<number>`count(*)::int`;

    const [[totals], historyRows, breakdown, monthly] = await Promise.all([
      selectEarningsTotals(host.id),
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
        .where(completedWhere)
        .orderBy(desc(bookings.date))
        .limit(HISTORY_LIMIT),
      db
        .select({
          experienceId: experiences.id,
          experienceTitleEn: experiences.titleEn,
          experienceTitleAr: experiences.titleAr,
          count: rowCount,
          payoutSar: payoutSum,
        })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(completedWhere)
        .groupBy(experiences.id, experiences.titleEn, experiences.titleAr)
        .orderBy(desc(payoutSum)),
      db
        .select({
          month: sql<string>`to_char(${bookings.date}, 'YYYY-MM')`,
          count: rowCount,
          payoutSar: payoutSum,
        })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(completedWhere)
        .groupBy(sql`to_char(${bookings.date}, 'YYYY-MM')`)
        .orderBy(desc(sql`to_char(${bookings.date}, 'YYYY-MM')`))
        .limit(12),
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
      breakdown,
      monthly,
    };
  } catch (error) {
    reportError(error, { surface: 'host-earnings:get' });
    return null;
  }
}
