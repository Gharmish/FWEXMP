import { desc, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminGuard } from '@/features/admin/guard';
import { rolling12mTurnoverExpr, vatPortionExpr } from '@/features/bookings/lib/payout-sql';
import { getPlatformSettings } from '@/lib/platform-settings';
import { toInstantBounds, type DateRange } from '@/features/admin/dashboard/lib/date-range';

/**
 * VAT filing read-model. Everything here is on the TAX-POINT basis —
 * bucketed by `paid_at` (when the money moved and the rate was stamped),
 * never `created_at` — because that is what goes on a ZATCA return.
 * Credit notes (full refunds of stamped bookings) are bucketed by
 * `refunded_at`: a refund in a later period reduces THAT period's net
 * VAT due, it never restates the period the sale was declared in.
 */

export interface VatReportRow {
  referenceCode: string;
  /** ISO instant the payment settled (the tax point). */
  paidAt: string;
  grossSar: number;
  taxableSar: number;
  vatSar: number;
  rateBps: number;
  /** This row also produced a credit note (full refund). */
  refunded: boolean;
  refundedAt: string | null;
}

export interface VatReport {
  vatEnabled: boolean;
  /** Output (sales) side, paid_at in range. */
  outputCount: number;
  outputGrossSar: number;
  outputTaxableSar: number;
  outputVatSar: number;
  /** Credit notes: VAT-stamped refunds, refunded_at in range. */
  creditCount: number;
  creditGrossSar: number;
  creditVatSar: number;
  /** Output VAT minus credit-note reversals for the range. */
  netVatDueSar: number;
  /** Paid in range with NO VAT stamp — should be 0 while VAT is on. */
  unstampedPaidCount: number;
  rows: readonly VatReportRow[];
  /** True when the detail table hit its cap and rows were dropped. */
  truncated: boolean;
  threshold: VatThreshold;
}

export interface VatThreshold {
  /** Paid gross over the trailing 365 days. */
  rolling12mGrossSar: number;
  /** Gross minus refunded sales from the same window. */
  rolling12mNetSar: number;
  /** Commission-only track (relevant if the agent model is ever adopted). */
  rolling12mCommissionSar: number;
}

/** Detail-table cap — a filing quarter at launch scale fits well inside. */
const ROWS_LIMIT = 1000;

/** A Date bound as a casted timestamptz literal (postgres-js can't take raw Dates in sql``). */
const ts = (d: Date): SQL => sql`${d.toISOString()}::timestamptz`;

export async function getVatReport(range: DateRange): Promise<VatReport | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const { start, endExclusive } = toInstantBounds(range);
    const vat = vatPortionExpr();
    const paidInRange = sql`${bookings.paidAt} >= ${ts(start)} and ${bookings.paidAt} < ${ts(endExclusive)}`;
    const refundedInRange = sql`${bookings.refundedAt} >= ${ts(start)} and ${bookings.refundedAt} < ${ts(endExclusive)}`;
    const stamped = sql`${bookings.vatRateBps} is not null`;
    const paid12m = sql`${bookings.paidAt} >= now() - interval '365 days'`;
    // Commission on the ex-VAT net — mirrors splitCommission/payoutExpr.
    const commission = sql`round((${bookings.totalAmount} - ${vat}) * least(10000, greatest(0, ${bookings.commissionBps}))::numeric / 10000)`;
    // What a credit note actually reverses: the CARD leg returned, not
    // the whole invoice (2026-07-28 fifth audit). `executeRefund` sets
    // status='refunded' on any successful refund, and two live policy
    // tiers refund 50% — so summing `total_amount` over refunded rows
    // over-reversed output tax on every partial, underpaying ZATCA and
    // contradicting the credit note the guest was actually issued.
    // Mirrors the invoice page's `min(refundedAmountSar, total)`.
    const reversedGross = sql`least(coalesce(${bookings.refundedAmountSar}, ${bookings.totalAmount}), ${bookings.totalAmount})`;
    const reversedVat = sql`coalesce(round(${reversedGross} * ${bookings.vatRateBps}::numeric / (10000 + ${bookings.vatRateBps})), 0)::int`;

    const [[agg], rowsRaw, settings] = await Promise.all([
      db
        .select({
          outputCount: sql<number>`count(*) filter (where ${stamped} and ${paidInRange})::int`,
          outputGrossSar: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${stamped} and ${paidInRange}), 0)::int`,
          outputVatSar: sql<number>`coalesce(sum(${vat}) filter (where ${stamped} and ${paidInRange}), 0)::int`,
          creditCount: sql<number>`count(*) filter (where ${stamped} and ${bookings.status} = 'refunded' and ${refundedInRange})::int`,
          creditGrossSar: sql<number>`coalesce(sum(${reversedGross}) filter (where ${stamped} and ${bookings.status} = 'refunded' and ${refundedInRange}), 0)::int`,
          creditVatSar: sql<number>`coalesce(sum(${reversedVat}) filter (where ${stamped} and ${bookings.status} = 'refunded' and ${refundedInRange}), 0)::int`,
          unstampedPaidCount: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'paid' and ${bookings.vatRateBps} is null and ${paidInRange})::int`,
          rolling12mGrossSar: sql<number>`coalesce(sum(${bookings.totalAmount} + coalesce(${bookings.walletAppliedSar}, 0)) filter (where ${bookings.paidAt} is not null and ${paid12m}), 0)::int`,
          // Windowed by `paid_at` and requiring it non-null — restored
          // 2026-07-28 (sixth audit). Dropping that predicate let an
          // UNPAID-but-refunded booking be subtracted from turnover it
          // never entered (440 of 4,000 SAR on live data), and netting
          // by `refunded_at` against a `paid_at` gross let a refund of
          // an out-of-window sale subtract from supplies it was never
          // counted in. Both understate the registration tripwire.
          // Consideration includes redeemed credit, matching
          // `rolling12mTurnoverExpr` and the cron alert.
          // THE shared expression, not a hand-mirrored copy (2026-07-28
          // seventh audit). The sixth-audit commit claimed it had
          // reconciled this surface with the cron alert and in fact only
          // pointed the CRON at `rolling12mTurnoverExpr()`, leaving a
          // transcribed duplicate here. The two agreed — but "agrees
          // today because someone transcribed it carefully" is exactly
          // the mirrored-call-site pattern that produced a defect in five
          // of the six audit rounds. One expression, two callers.
          rolling12mNetSar: rolling12mTurnoverExpr(),
          rolling12mCommissionSar: sql<number>`coalesce(round(sum(${commission}) filter (where ${bookings.paidAt} is not null and ${paid12m})), 0)::int`,
        })
        .from(bookings),
      db
        .select({
          referenceCode: bookings.referenceCode,
          paidAt: bookings.paidAt,
          grossSar: bookings.totalAmount,
          vatSar: vat,
          rateBps: bookings.vatRateBps,
          status: bookings.status,
          refundedAt: bookings.refundedAt,
        })
        .from(bookings)
        .where(sql`${stamped} and ${paidInRange}`)
        .orderBy(desc(bookings.paidAt))
        .limit(ROWS_LIMIT + 1),
      getPlatformSettings(),
    ]);

    if (!agg) throw new Error('vat report: empty aggregate row');

    const truncated = rowsRaw.length > ROWS_LIMIT;
    const rows = rowsRaw.slice(0, ROWS_LIMIT).map<VatReportRow>((r) => ({
      referenceCode: r.referenceCode,
      paidAt: r.paidAt?.toISOString() ?? '',
      grossSar: r.grossSar,
      taxableSar: r.grossSar - r.vatSar,
      vatSar: r.vatSar,
      rateBps: r.rateBps ?? 0,
      refunded: r.status === 'refunded',
      refundedAt: r.refundedAt?.toISOString() ?? null,
    }));

    return {
      vatEnabled: settings.vatEnabled,
      outputCount: agg.outputCount,
      outputGrossSar: agg.outputGrossSar,
      outputTaxableSar: agg.outputGrossSar - agg.outputVatSar,
      outputVatSar: agg.outputVatSar,
      creditCount: agg.creditCount,
      creditGrossSar: agg.creditGrossSar,
      creditVatSar: agg.creditVatSar,
      netVatDueSar: agg.outputVatSar - agg.creditVatSar,
      unstampedPaidCount: agg.unstampedPaidCount,
      rows,
      truncated,
      threshold: {
        rolling12mGrossSar: agg.rolling12mGrossSar,
        rolling12mNetSar: agg.rolling12mNetSar,
        rolling12mCommissionSar: agg.rolling12mCommissionSar,
      },
    };
  } catch (error) {
    reportError(error, { surface: 'admin:vatReport' });
    return null;
  }
}
