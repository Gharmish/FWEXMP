import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { bookings } from '@/db/schema';

/**
 * Shared SQL for payout math, so the host earnings page, the admin
 * payouts page, the dashboard, and the mark-paid action agree to the
 * riyal — and all of them read the commission SNAPSHOT on the booking,
 * never the experience's current (editable) rate.
 */

/**
 * Per-booking host payout: `total - round(total * clamp(bps)/10000)`.
 * Identical math to the unit-tested `splitCommission`.
 */
export function payoutExpr(): SQL<number> {
  return sql<number>`(${bookings.totalAmount} - round(${bookings.totalAmount} * least(10000, greatest(0, ${bookings.commissionBps}))::numeric / 10000))::int`;
}

/**
 * The platform actually collected this booking's money: paid online, or
 * the booking never required online payment (`paymentDeadline` is only
 * ever stamped when a booking is routed to checkout). Payouts must not
 * accrue on completed-but-never-collected bookings — that would be the
 * platform owing hosts money it never received.
 */
export function paymentCollected(): SQL {
  return sql`(${bookings.paymentStatus} = 'paid' or ${bookings.paymentDeadline} is null)`;
}
