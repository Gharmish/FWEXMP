import type { bookings } from '@/db/schema';

export type HostBookingStatus = (typeof bookings.$inferSelect)['status'];
export type HostBookingPaymentStatus = (typeof bookings.$inferSelect)['paymentStatus'];
export type HostCancellationKind = NonNullable<(typeof bookings.$inferSelect)['cancellationKind']>;

/**
 * Why a pending request can no longer be accepted by the host — computed
 * server-side from the same clock the transition executor asserts, so
 * the card can say so BEFORE the click instead of a `too_late` error
 * after it. `started` = the session has begun (admin can't approve
 * either); `cutoff` = inside the listing's lead-time window (admin still
 * can). Null = acceptable.
 */
export type HostApprovalClosed = 'started' | 'cutoff' | null;

/**
 * One booking row as the owning host sees it. Money is the host's side
 * of the split (payout after platform commission) — the commission rate
 * itself is admin/host-agreement territory and shown as the delta, not
 * the bps. Guest phone is withheld until the host has accepted the
 * booking (pending requests show the name only), mirroring the
 * marketplace norm so declined guests never leak contact details.
 */
export interface HostBookingRow {
  id: string;
  /** Short human reference (`GH-7K3M9X`) — matches what the guest sees. */
  referenceCode: string;
  status: HostBookingStatus;
  paymentStatus: HostBookingPaymentStatus;
  date: string;
  /** Local start time, HH:MM (24h). */
  startTime: string;
  partySize: number;
  totalAmountSar: number;
  /** Host payout after commission (whole SAR). */
  payoutSar: number;
  createdAt: string;
  /** Request-to-book: when this pending request auto-expires. ISO; null otherwise. */
  approvalDeadline: string | null;
  /** When an approved-but-unpaid hold lapses (guest payment window). ISO; null when none. */
  paymentDeadline: string | null;

  experienceId: string;
  experienceSlug: string;
  experienceTitleEn: string;
  experienceTitleAr: string;

  /** The listing's group cap on the booking's date. */
  maxGroupSize: number;
  /** Seats held by OTHER active bookings on the same listing + date. */
  seatsTakenByOthers: number;
  approvalClosed: HostApprovalClosed;

  guestName: string;
  /** Null until the booking is confirmed/completed (and for email-only guests). */
  guestPhone: string | null;
  /** The guest's message to the host from the request step, if any. */
  guestNote: string | null;
  /** Who cancelled, when the row is cancelled/refunded. */
  cancellationKind: HostCancellationKind | null;
}

/** The booking detail page: the row plus its lifecycle timeline. */
export interface HostBookingDetail extends HostBookingRow {
  policyTier: (typeof bookings.$inferSelect)['policyTier'];
  paymentBrand: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  reminderSentAt: string | null;
  finalReminderSentAt: string | null;
  hostPaidAt: string | null;
  cancellationReason: string | null;
  refundedAmountSar: number | null;
  rescheduledFromDate: string | null;
  rescheduleCount: number;
  termsAcceptedAt: string | null;
  womenOnlyAttestedAt: string | null;
  minAgeAttestedAt: string | null;
}

/** One confirmed session on the host's calendar over the next few days. */
export interface HostComingUpRow {
  id: string;
  referenceCode: string;
  date: string;
  startTime: string;
  partySize: number;
  paymentStatus: HostBookingPaymentStatus;
  paymentDeadline: string | null;
  guestName: string;
  experienceId: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  maxGroupSize: number;
  seatsTakenByOthers: number;
}

/** Per-day rollup for the bookings calendar view. */
export interface HostCalendarDay {
  date: string;
  bookings: number;
  guests: number;
  pending: number;
}
