import { vatPortionSar } from '@/features/bookings/lib/vat';

/**
 * Commission math — extracted from availability.ts (2026-07 audit M11:
 * money arithmetic was living in a module named "availability", which is
 * why admin/payout code imported commission from a calendar file). Pure
 * and DB-free; the bps snapshots live on each booking row.
 *
 * VAT era (owner decision 2026-07-07, principal model): when a booking
 * carries a VAT snapshot (`bookings.vat_rate_bps`, stamped at payment
 * settlement), the VAT portion belongs to ZATCA, and commission is
 * calculated on the ex-VAT (net) amount:
 *
 *   vat        = total × rate / (10000 + rate)   (prices are inclusive)
 *   net        = total − vat
 *   commission = round(net × bps / 10000)
 *   payout     = net − commission
 *
 * so `vat + commission + payout === total` to the riyal. A null/0 VAT
 * rate (every booking settled before registration) degenerates to the
 * original formula — history is never restated. Mirrored in SQL by
 * `payoutExpr()` (payout-sql.ts); change BOTH or the surfaces diverge.
 */

/** Whole-SAR split of a booking total into VAT + platform commission + host payout. */
export function splitCommission(
  totalAmountSar: number,
  commissionBps: number,
  vatRateBps?: number | null,
): { commissionSar: number; payoutSar: number; vatSar: number } {
  const clampedBps = Math.min(10000, Math.max(0, Math.round(commissionBps)));
  const vatSar = vatPortionSar(totalAmountSar, vatRateBps ?? 0);
  const netSar = totalAmountSar - vatSar;
  const commissionSar = Math.round((netSar * clampedBps) / 10000);
  return { commissionSar, payoutSar: netSar - commissionSar, vatSar };
}
