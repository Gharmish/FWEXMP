import type { bookings } from '@/db/schema';

export type AdminBookingStatus = (typeof bookings.$inferSelect)['status'];

/**
 * Compact view of a booking for the admin list. One row carries
 * everything the reviewer needs to triage / debug a request without
 * a per-booking detail page (which we'll add when volume justifies).
 */
export interface AdminBookingRow {
  id: string;
  reference: string;
  /** Short human reference (`GH-7K3M9X`) — what the guest quotes to support. */
  referenceCode: string;
  status: AdminBookingStatus;
  paymentStatus: (typeof bookings.$inferSelect)['paymentStatus'];
  /** Whole-SAR refund owed back after a failed automatic refund; null = none. */
  refundDueSar: number | null;
  /**
   * Set = an unmatched capture is outstanding, so `createCheckout`
   * refuses a new payment. An admin must reconcile at HyperPay and clear
   * it (`resolveSettleAnomaly`) before the guest can pay again.
   */
  settleAnomalyAt?: string | null;
  settleAnomalyKind?: string | null;
  /** Request-to-book: when the host's approve/decline window closes. */
  approvalDeadline: string | null;
  date: string;
  startTime: string;
  partySize: number;
  totalAmountSar: number;
  /** Platform commission on this booking (whole SAR). */
  commissionSar: number;
  /** Host payout after commission (whole SAR). */
  payoutSar: number;
  /** Commission rate applied, basis points (1500 = 15%). */
  commissionBps: number;
  currency: string;
  paymentReference: string | null;
  createdAt: string;
  /** Who called the booking off; null = never cancelled (or legacy row). */
  cancellationKind: (typeof bookings.$inferSelect)['cancellationKind'];
  /** The mandatory emergency note (also on guest/operator rows when set). */
  cancellationReason: string | null;
  /** How the refund travelled; null = never refunded. */
  refundMethod: (typeof bookings.$inferSelect)['refundMethod'];
  /** Gharmish Credit redeemed against this booking at checkout. */
  walletAppliedSar: number;

  experienceSlug: string;
  experienceTitleEn: string;

  guestName: string;
  /** Null for email-OTP guests (the column is nullable); booked guests usually have one. */
  guestPhone: string | null;
}
