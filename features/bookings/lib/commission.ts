/**
 * Commission math — extracted from availability.ts (2026-07 audit M11:
 * money arithmetic was living in a module named "availability", which is
 * why admin/payout code imported commission from a calendar file). Pure
 * and DB-free; the bps snapshot lives on each booking row.
 */

/** Whole-SAR split of a booking total into platform commission + host payout. */
export function splitCommission(
  totalAmountSar: number,
  commissionBps: number,
): { commissionSar: number; payoutSar: number } {
  const clampedBps = Math.min(10000, Math.max(0, Math.round(commissionBps)));
  const commissionSar = Math.round((totalAmountSar * clampedBps) / 10000);
  return { commissionSar, payoutSar: totalAmountSar - commissionSar };
}
