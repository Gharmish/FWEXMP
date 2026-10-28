import { MIN_CHARGE_SAR } from '@/features/promo-codes/lib/discount';

export interface WalletFieldVisibilityInput {
  /** The signed-in viewer owns the booking's guest row (credit is theirs to spend). */
  walletOwner: boolean;
  balanceSar: number;
  /** Credit already applied to this booking. */
  appliedSar: number;
  /** The booking's current total, after any promo and applied credit. */
  totalSar: number;
}

/**
 * Whether the pay page offers the Gharmish Credit field. Applied credit
 * always shows (so it can be removed). Otherwise there must be both a
 * balance and room under the total: the card has to charge at least
 * MIN_CHARGE_SAR, so a total already at the floor (a 100% or oversized
 * promo) would offer "Apply SAR 0" and fail with nothing_to_apply.
 */
export function walletFieldVisible({
  walletOwner,
  balanceSar,
  appliedSar,
  totalSar,
}: WalletFieldVisibilityInput): boolean {
  if (!walletOwner) return false;
  if (appliedSar > 0) return true;
  return balanceSar > 0 && totalSar - MIN_CHARGE_SAR > 0;
}
