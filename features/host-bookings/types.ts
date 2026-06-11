import type { bookings } from '@/db/schema';

export type HostBookingStatus = (typeof bookings.$inferSelect)['status'];
export type HostBookingPaymentStatus = (typeof bookings.$inferSelect)['paymentStatus'];

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
  reference: string;
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

  guestName: string;
  /** Null until the booking is confirmed/completed (and for email-only guests). */
  guestPhone: string | null;
}
