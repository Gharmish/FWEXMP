import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import {
  bookings,
  disputes,
  experiences,
  guests,
  hostApplications,
  platformSettings,
} from '@/db/schema';
import { paymentCollected, payoutExpr } from '@/features/bookings/lib/payout-sql';
import { adminGuard } from '@/features/admin/guard';

/**
 * Lightweight aggregate for the admin landing page. A handful of cheap
 * COUNT/SUM round-trips (no row scan into JS) so the operator's first
 * screen is headline KPIs + a live "what needs me now" queue, not a
 * static link menu.
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export interface AdminDashboard {
  gmvAllTimeSar: number;
  bookingsTotal: number;
  guests: number;
  activeExperiences: number;
  /** Live experiences flagged as featured (Originals tier). */
  featuredLive: number;
  /**
   * Platform net revenue (commission) on confirmed + completed bookings
   * placed in the last 30 days — `sum(totalAmount * commissionBps/10000)`
   * MINUS promo discounts funded in the window (platform-funded model).
   * The honest "take" figure: GMV is what flows through, this is what we
   * keep after paying hosts on the pre-discount price.
   */
  netRevenue30dSar: number;
  /**
   * Last completed release-holds cron run. Null until the heartbeat
   * column has been stamped once. The dashboard flags staleness — a
   * dead cron silently stops expiry, hold release, reconciliation, and
   * reminders.
   */
  cronLastRunAt: Date | null;
  queue: {
    pendingApplications: number;
    pendingReview: number;
    changesRequested: number;
    pendingBookings: number;
    upcomingBookings: number;
    /** Open guest disputes ("a real person will reply"). */
    openDisputes: number;
    /** Bookings stamped refund_due_sar — money owed back to guests. */
    refundsDueCount: number;
    refundsDueSar: number;
    /** Completed-and-paid bookings not yet paid out to hosts. */
    payoutsOwedSar: number;
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    // Two waves of 4, not one Promise.all of 8: the postgres-js pool is 5
    // connections on Vercel and shared across concurrent renders on the
    // same instance — see metrics-queries.ts for the failure mode.
    const [bookingRow, guestRow, expRow, appRow] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          // GMV excludes refunded bookings (mirrors the analytics view).
          gmv: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} <> 'refunded'), 0)::int`,
          pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
          upcoming: sql<number>`count(*) filter (where ${bookings.date} >= current_date and ${bookings.status} in ('pending','confirmed'))::int`,
          refundsDueCount: sql<number>`count(*) filter (where ${bookings.refundDueSar} is not null)::int`,
          refundsDueSar: sql<number>`coalesce(sum(${bookings.refundDueSar}), 0)::int`,
        })
        .from(bookings),
      db.select({ n: sql<number>`count(*)::int` }).from(guests),
      db
        .select({
          active: sql<number>`count(*) filter (where ${experiences.status} = 'live')::int`,
          featured: sql<number>`count(*) filter (where ${experiences.status} = 'live' and ${experiences.featured})::int`,
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
    const [netRow, disputeRow, payoutRow, heartbeatRow] = await Promise.all([
      // Net commission on revenue bookings in the trailing 30 days, from
      // the per-booking commission snapshot, net of promo discounts AND
      // redeemed Gharmish Credit the platform funded in the same window
      // (both platform-funded — the host is paid on the full base).
      db
        .select({
          net: sql<number>`coalesce(sum((${bookings.totalAmount} * ${bookings.commissionBps} / 10000.0) - coalesce(${bookings.discountSar}, 0) - coalesce(${bookings.walletAppliedSar}, 0)) filter (where ${bookings.status} in ('confirmed','completed') and ${bookings.createdAt} >= now() - interval '30 days'), 0)::int`,
        })
        .from(bookings),
      db
        .select({ n: sql<number>`count(*) filter (where ${disputes.status} = 'open')::int` })
        .from(disputes),
      // Payouts owed: completed + collected bookings the host hasn't been
      // paid for. Same per-booking split expression as the payouts page.
      db
        .select({
          owed: sql<number>`coalesce(sum(${payoutExpr()}) filter (where ${bookings.hostPaidAt} is null and ${paymentCollected()}), 0)::int`,
        })
        .from(bookings)
        .where(eq(bookings.status, 'completed')),
      db
        .select({ at: platformSettings.lastCronRunAt })
        .from(platformSettings)
        .where(eq(platformSettings.id, 'platform')),
    ]);

    return {
      gmvAllTimeSar: bookingRow[0]?.gmv ?? 0,
      bookingsTotal: bookingRow[0]?.total ?? 0,
      guests: guestRow[0]?.n ?? 0,
      activeExperiences: expRow[0]?.active ?? 0,
      featuredLive: expRow[0]?.featured ?? 0,
      netRevenue30dSar: netRow[0]?.net ?? 0,
      cronLastRunAt: heartbeatRow[0]?.at ?? null,
      queue: {
        pendingApplications: appRow[0]?.n ?? 0,
        pendingReview: expRow[0]?.pendingReview ?? 0,
        changesRequested: expRow[0]?.changesRequested ?? 0,
        pendingBookings: bookingRow[0]?.pending ?? 0,
        upcomingBookings: bookingRow[0]?.upcoming ?? 0,
        openDisputes: disputeRow[0]?.n ?? 0,
        refundsDueCount: bookingRow[0]?.refundsDueCount ?? 0,
        refundsDueSar: bookingRow[0]?.refundsDueSar ?? 0,
        payoutsOwedSar: payoutRow[0]?.owed ?? 0,
      },
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getAdminDashboard' });
    return null;
  }
}
