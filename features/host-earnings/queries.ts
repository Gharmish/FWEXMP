import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, payoutClawbacks, payouts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentHostId } from '@/features/host-dashboard/queries';
import { paymentCollected, payoutExpr, vatPortionExpr } from '@/features/bookings/lib/payout-sql';
import { decryptPii } from '@/lib/pii-crypto';

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
  /**
   * VAT portion contained in the gross (per-booking settlement snapshot).
   * 0 for bookings settled before the platform registered for VAT.
   */
  vatSar: number;
  /**
   * The platform's NET deduction as seen from the host's side:
   * `totalSar − vatSar − payoutSar`, so every statement row sums back
   * to what the guest was charged. NOT the commission rate applied to a
   * base (2026-08-01 ninth audit — the old doc said "on the ex-VAT
   * net", which is `splitCommission`'s definition and differs on every
   * promo/credit booking): the payout base adds platform-funded
   * discounts and redeemed credit back, so this figure is commission
   * MINUS that funding and goes negative when the funding exceeds the
   * commission. Deliberate presentation — the host statement shows the
   * guest's money, not the platform's marketing spend.
   */
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

/** One recorded payout batch — the header of a remittance statement. */
export interface HostPayoutBatch {
  id: string;
  /** ISO instant the admin recorded the transfer. */
  createdAt: string;
  amountSar: number;
  bookingCount: number;
}

/** A payout batch plus its per-booking money breakdown. */
export interface HostPayoutStatement extends HostPayoutBatch {
  /** IBAN the batch was sent to (as recorded), null for legacy rows. */
  payoutIban: string | null;
  bankReference: string | null;
  rows: readonly HostPayoutStatementRow[];
  /**
   * Clawback deductions absorbed by THIS batch (refunds issued after an
   * earlier payout). `amountSar` above is already net of these.
   */
  deductions: readonly HostPayoutDeductionRow[];
}

export interface HostPayoutDeductionRow {
  /** Reference code of the refunded booking the deduction reverses. */
  referenceCode: string;
  amountSar: number;
}

export interface HostPayoutStatementRow {
  referenceCode: string;
  date: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  partySize: number;
  totalSar: number;
  vatSar: number;
  commissionSar: number;
  commissionBps: number;
  payoutSar: number;
}

/** Booking-date bounds (inclusive, `YYYY-MM-DD`) for the ledger + rollups. */
export interface HostEarningsRange {
  from?: string;
  to?: string;
}

/** Which bookings the ledger lists: earned (completed) or projected (confirmed, ahead). */
export type HostLedgerScope = 'completed' | 'upcoming';

/** Ledger rows per page (2026-08-22 audit P2-11 — the 200-row cap was silent). */
export const HISTORY_PAGE_SIZE = 25;

export interface HostEarnings extends HostEarningsTotals {
  payoutIban: string | null;
  /** One page of the ledger, newest-first, in the active scope. */
  history: readonly HostEarningsHistoryRow[];
  /** Ledger rows in the active scope + range (all pages). */
  historyTotal: number;
  historyPage: number;
  historyScope: HostLedgerScope;
  /** Completed earnings per experience, biggest payout first. */
  breakdown: readonly HostEarningsBreakdownRow[];
  /** Completed earnings per month, newest first (12-month window). */
  monthly: readonly HostEarningsMonthlyRow[];
}

/** The one aggregate row behind both earnings surfaces. */
function selectEarningsTotals(hostId: string) {
  const payout = payoutExpr();
  const collected = paymentCollected();
  return db
    .select({
      owedSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is null and ${collected}), 0)::int`,
      owedCount: sql<number>`coalesce(count(*) filter (where ${bookings.status} = 'completed' and ${bookings.hostPaidAt} is null and ${collected}), 0)::int`,
      // Keyed on `hostPaidAt` alone (2026-07-20 audit): a paid-out
      // booking that is LATER refunded keeps its place in "paid to
      // date", so the KPI keeps summing to the historical statements —
      // the reversal shows up as a clawback deduction, not a silently
      // shrinking total.
      paidSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
      paidCount: sql<number>`coalesce(count(*) filter (where ${bookings.hostPaidAt} is not null), 0)::int`,
      upcomingSar: sql<number>`coalesce(sum(${payout}) filter (where ${bookings.status} = 'confirmed' and ${collected}), 0)::int`,
      upcomingCount: sql<number>`coalesce(count(*) filter (where ${bookings.status} = 'confirmed' and ${collected}), 0)::int`,
    })
    .from(bookings)
    .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
    .where(
      and(
        eq(experiences.hostId, hostId),
        // Refunded-after-payout rows must stay in the scan for the
        // hostPaidAt-keyed "paid" figures above.
        sql`(${bookings.status} in ('completed', 'confirmed') or ${bookings.hostPaidAt} is not null)`,
      ),
    );
}

/**
 * Totals only — the overview's KPI strip. Skips the 200-row ledger the
 * full `getHostEarnings` hydrates for /host/earnings.
 */
export async function getHostEarningsTotals(): Promise<HostEarningsTotals | null> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return null;
  try {
    const [totals] = await selectEarningsTotals(hostId);
    return {
      owedSar: totals?.owedSar ?? 0,
      owedCount: totals?.owedCount ?? 0,
      paidSar: totals?.paidSar ?? 0,
      paidCount: totals?.paidCount ?? 0,
      upcomingSar: totals?.upcomingSar ?? 0,
      upcomingCount: totals?.upcomingCount ?? 0,
    };
  } catch (error) {
    // Rethrow: null means "not a host", never "query failed" — a swallowed
    // error rendered the zero-earnings empty state over real money.
    reportError(error, { surface: 'host-earnings:totals' });
    throw error;
  }
}

export async function getHostEarnings(
  range?: HostEarningsRange,
  ledger: { scope?: HostLedgerScope; page?: number } = {},
): Promise<HostEarnings | null> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return null;
  const historyScope: HostLedgerScope = ledger.scope === 'upcoming' ? 'upcoming' : 'completed';
  const historyPage = Math.max(0, Math.trunc(ledger.page ?? 0));
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.id, hostId),
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

    // The ledger follows the scope switch: earned rows, or the confirmed
    // bookings still ahead (so "on the calendar" can be reconciled).
    const ledgerConds: SQL[] = [
      eq(experiences.hostId, host.id),
      eq(bookings.status, historyScope === 'upcoming' ? 'confirmed' : 'completed'),
    ];
    if (historyScope === 'upcoming') ledgerConds.push(paymentCollected());
    if (range?.from) ledgerConds.push(gte(bookings.date, range.from));
    if (range?.to) ledgerConds.push(lte(bookings.date, range.to));
    const ledgerWhere = and(...ledgerConds);

    const payoutSum = sql<number>`coalesce(sum(${payout}), 0)::int`;
    const rowCount = sql<number>`count(*)::int`;

    const [[totals], historyRows, [historyCount], breakdown, monthly] = await Promise.all([
      selectEarningsTotals(host.id),
      db
        .select({
          id: bookings.id,
          date: bookings.date,
          experienceTitleEn: experiences.titleEn,
          experienceTitleAr: experiences.titleAr,
          partySize: bookings.partySize,
          totalSar: bookings.totalAmount,
          vatSar: vatPortionExpr(),
          commissionBps: bookings.commissionBps,
          payoutSar: payout,
          paidOutAt: bookings.hostPaidAt,
        })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(ledgerWhere)
        .orderBy(historyScope === 'upcoming' ? bookings.date : desc(bookings.date))
        .limit(HISTORY_PAGE_SIZE)
        .offset(historyPage * HISTORY_PAGE_SIZE),
      db
        .select({ count: rowCount })
        .from(bookings)
        .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
        .where(ledgerWhere),
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
      payoutIban: decryptPii(host.payoutIban),
      history: historyRows.map((row) => ({
        ...row,
        // VAT belongs to ZATCA, not the platform — never label it as
        // commission in the host's ledger.
        commissionSar: row.totalSar - row.vatSar - row.payoutSar,
        paidOutAt: row.paidOutAt ? row.paidOutAt.toISOString() : null,
      })),
      historyTotal: historyCount?.count ?? 0,
      historyPage,
      historyScope,
      breakdown,
      monthly,
    };
  } catch (error) {
    // Rethrow — see getHostEarningsTotals.
    reportError(error, { surface: 'host-earnings:get' });
    throw error;
  }
}

/** The signed-in host's id, or null (not signed in / not a host / no DB). */
async function currentHostId(): Promise<string | null> {
  if (!serverEnv.DATABASE_URL) return null;
  return getCurrentHostId();
}

/**
 * The host's recorded payout batches, newest first — each links to its
 * printable remittance statement.
 */
export async function getHostPayoutBatches(): Promise<readonly HostPayoutBatch[] | null> {
  try {
    const hostId = await currentHostId();
    if (!hostId) return null;
    const rows = await db
      .select({
        id: payouts.id,
        createdAt: payouts.createdAt,
        amountSar: payouts.amountSar,
        bookingCount: payouts.bookingCount,
      })
      .from(payouts)
      .where(eq(payouts.hostId, hostId))
      .orderBy(desc(payouts.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  } catch (error) {
    // Rethrow — see getHostEarningsTotals.
    reportError(error, { surface: 'host-earnings:payoutBatches' });
    throw error;
  }
}

/**
 * One payout batch with its booking-level breakdown — the remittance
 * statement (principal model: this is a payment advice from Gharmish to
 * the host, not a tax invoice). Ownership-guarded: only the batch's own
 * host can read it; anyone else gets null → notFound.
 */
export async function getHostPayoutStatement(
  payoutId: string,
): Promise<HostPayoutStatement | null> {
  try {
    const hostId = await currentHostId();
    if (!hostId) return null;

    const batch = await db.query.payouts.findFirst({
      where: (p) => and(eq(p.id, payoutId), eq(p.hostId, hostId)),
    });
    if (!batch) return null;

    const vat = vatPortionExpr();
    const rows = await db
      .select({
        referenceCode: bookings.referenceCode,
        date: bookings.date,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
        partySize: bookings.partySize,
        totalSar: bookings.totalAmount,
        vatSar: vat,
        commissionBps: bookings.commissionBps,
        payoutSar: payoutExpr(),
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(eq(bookings.payoutId, batch.id))
      .orderBy(desc(bookings.date));

    // Clawbacks this batch absorbed (refund-after-payout reversals) —
    // the batch amount is net of them, so the statement must show them.
    const deductions = await db
      .select({
        referenceCode: bookings.referenceCode,
        amountSar: payoutClawbacks.amountSar,
      })
      .from(payoutClawbacks)
      .innerJoin(bookings, eq(bookings.id, payoutClawbacks.bookingId))
      .where(eq(payoutClawbacks.settledPayoutId, batch.id))
      .orderBy(desc(payoutClawbacks.createdAt));

    return {
      id: batch.id,
      createdAt: batch.createdAt.toISOString(),
      amountSar: batch.amountSar,
      bookingCount: batch.bookingCount,
      payoutIban: decryptPii(batch.payoutIban),
      bankReference: batch.bankReference,
      rows: rows.map((row) => ({
        ...row,
        commissionSar: row.totalSar - row.vatSar - row.payoutSar,
      })),
      deductions,
    };
  } catch (error) {
    // Rethrow: null-on-error rendered this statement as a 404.
    reportError(error, { surface: 'host-earnings:payoutStatement', payoutId });
    throw error;
  }
}
