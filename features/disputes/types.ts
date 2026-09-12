/**
 * Types for the disputes feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface AdminDisputeRow {
  id: string;
  status: 'open' | 'resolved';
  message: string;
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  bookingId: string;
  bookingReference: string;
  bookingDate: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  experienceSlug: string;
  guestName: string;
  guestPhone: string | null;
  /** User-360 key: auth_<id> for claimed accounts, guest_<id> otherwise. */
  guestPersonKey: string;
  /** Whether resolving may offer the full-refund checkbox. */
  refundable: boolean;
  /**
   * Full paid base (card + redeemed credit) — labels the refund
   * checkbox with the same amount the resolve action refunds and the
   * guest notice reports.
   */
  bookingAmountSar: number;
  /** Refund granted at resolution time; null = resolved without one. */
  resolutionRefundSar: number | null;
}
