import { sql, type SQL } from 'drizzle-orm';
import { bookings } from '@/db/schema';

/**
 * Which unpaid holds the pre-lapse payment nudge (pass 3a) may reach.
 *
 * The nudge fires while the deadline is still ahead but within
 * `NUDGE_LEAD_MINUTES`, so the hourly cron catches a window that closes
 * ~2.5h out with time left to act. On its own that rule also matched
 * every instant hold: those live `PAYMENT_HOLD_MINUTES` (30) from
 * creation, so at the first tick after booking the guest received
 * "we can only hold it until {deadline}" minutes after "we're keeping
 * it for you until {deadline}" — same deadline, same button
 * (2026-10-17 scan, COMMS-02). A nudge is only worth sending into a
 * window long enough for the first message to have faded, so the hold
 * must have been open for at least `NUDGE_MIN_WINDOW_HOURS`: that keeps
 * the pay-after-approval windows (up to 24h) and drops the short instant
 * hold, whose lapse email already closes the story.
 *
 * Single-table predicate (the pass selects from `bookings` alone), so the
 * unqualified columns drizzle renders are unambiguous.
 */
export const NUDGE_LEAD_MINUTES = 150;
export const NUDGE_MIN_WINDOW_HOURS = 3;

export function paymentNudgeWindow(): SQL {
  return sql`${bookings.paymentDeadline} > now() and ${bookings.paymentDeadline} <= now() + ${sql.raw(`interval '${NUDGE_LEAD_MINUTES} minutes'`)} and ${bookings.paymentDeadline} - ${bookings.createdAt} >= ${sql.raw(`interval '${NUDGE_MIN_WINDOW_HOURS} hours'`)}`;
}
