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
 * calculated on the ex-VAT (net) amount.
 *
 * Promo era (owner decision 2026-07-09, PLATFORM-FUNDED): a promo code
 * reduces the charged total (`bookings.total_amount`) but the host is
 * paid as if the guest paid full price. So the payout base is the
 * PRE-DISCOUNT amount (`charged + discount`), and the platform absorbs
 * the discount out of its commission (which can go negative — a real
 * marketing cost). VAT is still carved from the actually-charged total
 * (the real consideration), not the notional full price:
 *
 *   vat        = charged × rate / (10000 + rate)   (prices are inclusive)
 *   net        = charged + discount − vat
 *   commission = round(net × bps / 10000)
 *   payout     = net − commission
 *
 * so `vat + commission + payout === charged + discount` to the riyal.
 * A null/0 VAT rate and a 0 discount degenerate to the original formula
 * — history is never restated. Mirrored in SQL by `payoutExpr()`
 * (payout-sql.ts); change BOTH or the surfaces diverge.
 */

/** Whole-SAR split of a booking's PRE-DISCOUNT value into VAT + commission + host payout. */
export function splitCommission(
  chargedAmountSar: number,
  commissionBps: number,
  vatRateBps?: number | null,
  discountSar?: number | null,
): { commissionSar: number; payoutSar: number; vatSar: number } {
  const clampedBps = Math.min(10000, Math.max(0, Math.round(commissionBps)));
  const vatSar = vatPortionSar(chargedAmountSar, vatRateBps ?? 0);
  const netSar = chargedAmountSar + Math.max(0, discountSar ?? 0) - vatSar;
  const commissionSar = Math.round((netSar * clampedBps) / 10000);
  return { commissionSar, payoutSar: netSar - commissionSar, vatSar };
}
