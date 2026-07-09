import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { bookings } from '@/db/schema';

/**
 * Shared SQL for payout math, so the host earnings page, the admin
 * payouts page, the dashboard, and the mark-paid action agree to the
 * riyal — and all of them read the commission + VAT SNAPSHOTS on the
 * booking, never the experience's current (editable) rate or today's
 * platform setting.
 */

/**
 * VAT portion contained in the inclusive total, from the per-booking
 * snapshot: `round(total × rate / (10000 + rate))`, 0 when the booking
 * settled without VAT (null rate). Identical math to `vatPortionSar`.
 */
export function vatPortionExpr(): SQL<number> {
  return sql<number>`coalesce(round(${bookings.totalAmount} * ${bookings.vatRateBps}::numeric / (10000 + ${bookings.vatRateBps})), 0)::int`;
}

/**
 * Per-booking host payout. VAT era (2026-07-07) + promo era (2026-07-09,
 * platform-funded): the host is paid on the PRE-DISCOUNT amount, so the
 * net base adds the promo discount back before commission —
 * `net = total + discount - vatPortion`, `payout = net - round(net *
 * clamp(bps)/10000)`. VAT is carved from the actually-charged total
 * (`vatPortionExpr` uses `total_amount`). A 0 discount and null VAT
 * reduce to the original `total - round(total * clamp(bps)/10000)`.
 * Identical math to the unit-tested `splitCommission` — change BOTH.
 */
export function payoutExpr(): SQL<number> {
  const net = sql`(${bookings.totalAmount} + coalesce(${bookings.discountSar}, 0) - ${vatPortionExpr()})`;
  return sql<number>`(${net} - round(${net} * least(10000, greatest(0, ${bookings.commissionBps}))::numeric / 10000))::int`;
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
