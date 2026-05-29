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
  status: AdminBookingStatus;
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

  experienceSlug: string;
  experienceTitleEn: string;

  guestName: string;
  guestPhone: string;
}
