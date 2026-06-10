/**
 * KSA VAT display helpers. Listed prices are VAT-INCLUSIVE (owner
 * decision, 2026-06-10): the guest pays exactly the listed total, and
 * checkout/receipt surfaces disclose the VAT portion contained in it —
 * `total × rate / (1 + rate)` — as "includes SAR X VAT". Never add VAT
 * on top of a listed price.
 */

/** KSA standard VAT rate, basis points. */
export const VAT_RATE_BPS = 1500;

/** Whole-SAR VAT portion contained in a VAT-inclusive total. */
export function vatPortionSar(totalSar: number, rateBps: number = VAT_RATE_BPS): number {
  if (totalSar <= 0 || rateBps <= 0) return 0;
  return Math.round((totalSar * rateBps) / (10000 + rateBps));
}

/** Display percentage for the current rate, e.g. 15. */
export function vatRatePercent(rateBps: number = VAT_RATE_BPS): number {
  return rateBps / 100;
}
