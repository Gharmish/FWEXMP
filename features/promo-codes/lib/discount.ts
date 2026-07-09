/**
 * Pure promo-code math — DB-free and framework-free so it unit-tests in
 * isolation and runs identically on the client (checkout preview) and the
 * server (the authoritative apply). No money leaves this module rounded
 * to anything but whole riyal.
 */

/** HyperPay cannot charge below 1 SAR, so a discount can never zero a total out. */
export const MIN_CHARGE_SAR = 1;

/** Code shape: 2–24 chars, A–Z/0–9, single internal hyphens allowed. */
export const PROMO_CODE_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const PROMO_CODE_MIN = 2;
export const PROMO_CODE_MAX = 24;

export type PromoDiscountType = 'percent' | 'fixed';

export interface PromoRule {
  discountType: PromoDiscountType;
  /** percent: 1–100; fixed: whole SAR. */
  discountValue: number;
}

/**
 * Canonical form of a code as typed by a guest or admin: trimmed and
 * upper-cased. The DB stores this exact form and matches on it, so
 * lookups are effectively case-insensitive.
 */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True when a normalized code is well-formed (shape + length). */
export function isValidPromoCode(code: string): boolean {
  return code.length >= PROMO_CODE_MIN && code.length <= PROMO_CODE_MAX && PROMO_CODE_RE.test(code);
}

/**
 * Whole-SAR discount for a pre-discount total under a rule. Percent
 * rounds to the nearest riyal. Both types are clamped to
 * `[0, total - MIN_CHARGE_SAR]` so the charged remainder never drops
 * below the gateway minimum. A non-positive total yields 0. This is pure
 * arithmetic — the eligibility gates (active, window, min-total, cap)
 * live in the apply action, not here.
 */
export function computeDiscountSar(totalSar: number, rule: PromoRule): number {
  if (totalSar <= 0) return 0;
  const raw =
    rule.discountType === 'percent'
      ? Math.round((totalSar * rule.discountValue) / 100)
      : Math.round(rule.discountValue);
  const maxDiscount = Math.max(0, totalSar - MIN_CHARGE_SAR);
  return Math.min(Math.max(0, raw), maxDiscount);
}
