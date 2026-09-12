import type { PromoCode } from '@/db/schema';

/**
 * Types for the promo-codes feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface PromoCodeRow {
  id: string;
  code: string;
  label: string | null;
  discountType: PromoCode['discountType'];
  discountValue: number;
  minTotalSar: number | null;
  maxRedemptions: number | null;
  /** Per-guest redemption cap. Null = unlimited (legacy/explicit). */
  maxRedemptionsPerGuest: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
  /** Live redemptions (bookings in a redeemed status referencing this code). */
  redemptions: number;
  /** Whole-SAR discount funded on paid bookings for this code. */
  discountFundedSar: number;
}
