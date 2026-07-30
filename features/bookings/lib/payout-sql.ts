import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { bookings } from '@/db/schema';
import { hasHyperpay } from '@/lib/env';

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
 * platform-funded) + Gharmish Credit era (2026-07-19, also
 * platform-funded): the host is paid on the FULL-PRICE amount, so the
 * net base adds the promo discount AND redeemed wallet credit back
 * before commission — `net = total + discount + credit - vatPortion`,
 * `payout = net - round(net * clamp(bps)/10000)`. VAT is carved from
 * the actually-charged total (`vatPortionExpr` uses `total_amount`).
 * Zero discount/credit and null VAT reduce to the original
 * `total - round(total * clamp(bps)/10000)`. Identical math to the
 * unit-tested `splitCommission` — change BOTH.
 */
export function payoutExpr(): SQL<number> {
  const net = sql`(${bookings.totalAmount} + coalesce(${bookings.discountSar}, 0) + coalesce(${bookings.walletAppliedSar}, 0) - ${vatPortionExpr()})`;
  return sql<number>`(${net} - round(${net} * least(10000, greatest(0, ${bookings.commissionBps}))::numeric / 10000))::int`;
}

/**
 * The platform actually collected this booking's money. Payouts must not
 * accrue on completed-but-never-collected bookings — that would be the
 * platform owing hosts money it never received.
 *
 * 2026-07-20 audit: a null `paymentDeadline` used to be accepted
 * unconditionally as "no online payment required". But creation stamps
 * it null whenever `hasHyperpay()` is false — which is ALSO what a
 * misconfigured/down gateway looks like, so an outage would have minted
 * real payout obligations on money never received. While the gateway is
 * configured, only `paid` counts; the null-deadline arm exists solely
 * for genuinely payment-off deployments (local dev, pre-gateway).
 */
export function paymentCollected(): SQL {
  return hasHyperpay()
    ? sql`${bookings.paymentStatus} = 'paid'`
    : sql`(${bookings.paymentStatus} = 'paid' or ${bookings.paymentDeadline} is null)`;
}

/**
 * Rolling-12-month TAXABLE TURNOVER against the ZATCA registration
 * threshold — the single expression BOTH surfaces must use: the
 * `/admin/vat` report and the cron's 90% alert (2026-07-28 sixth audit).
 *
 * They had drifted into measuring different things under the same
 * label and against the same constant: one grossed `total_amount`, the
 * other `total_amount + wallet_applied_sar`, so a wallet-assisted
 * booking moved the figure that decides whether registration happens
 * on time. Consideration includes redeemed credit — the platform
 * supplied that value, and the host payout base already adds it back.
 *
 * Windowing: BOTH sides key on `paid_at`. Netting a refund by
 * `refunded_at` while grossing by `paid_at` lets a refund of an
 * out-of-window sale subtract from supplies it was never counted in,
 * which can drive the figure arbitrarily low — the wrong direction for
 * a tripwire whose only failure mode that matters is a MISSED
 * registration. `paid_at is not null` is load-bearing: without it an
 * unpaid-but-refunded row is subtracted from turnover it never entered
 * (measured at 440 SAR of a 4,000 SAR base on live data).
 */
export function rolling12mTurnoverExpr(): SQL<number> {
  const consideration = sql`(${bookings.totalAmount} + coalesce(${bookings.walletAppliedSar}, 0))`;
  const inWindow = sql`${bookings.paidAt} is not null and ${bookings.paidAt} >= now() - interval '365 days'`;
  // Legacy rows predate `refunded_amount_sar` and were full refunds.
  const reversed = sql`least(coalesce(${bookings.refundedAmountSar}, ${consideration}), ${consideration})`;
  return sql<number>`coalesce(sum(${consideration}) filter (where ${inWindow}), 0)::int - coalesce(sum(${reversed}) filter (where ${bookings.status} = 'refunded' and ${inWindow}), 0)::int`;
}
