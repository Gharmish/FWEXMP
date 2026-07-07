/**
 * KSA VAT display helpers. Listed prices are VAT-INCLUSIVE (owner
 * decision, 2026-06-10): the guest pays exactly the listed total, and
 * checkout/receipt surfaces disclose the VAT portion contained in it —
 * `total × rate / (1 + rate)` — as "includes SAR X VAT". Never add VAT
 * on top of a listed price.
 *
 * Whether VAT is disclosed AT ALL is settings/snapshot-driven (2026-07-07):
 * the platform collects no VAT until ZATCA registration (375K SAR
 * threshold), so the rate always flows in explicitly — from
 * `platform_settings.vat_rate_bps` on pre-payment surfaces, or from the
 * per-booking `bookings.vat_rate_bps` snapshot on receipts and invoices.
 * There is deliberately no default rate here anymore.
 */

/** Whole-SAR VAT portion contained in a VAT-inclusive total. */
export function vatPortionSar(totalSar: number, rateBps: number): number {
  if (totalSar <= 0 || rateBps <= 0) return 0;
  return Math.round((totalSar * rateBps) / (10000 + rateBps));
}

/** Display percentage for a basis-point rate, e.g. 1500 → 15. */
export function vatRatePercent(rateBps: number): number {
  return rateBps / 100;
}
