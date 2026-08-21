import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, disputes, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminGuard } from '@/features/admin/guard';
import { authKey, guestKey } from '@/features/admin/users/lib/keys';
import { isDisputeRefundable } from '@/features/disputes/lib/refundable';

/**
 * Dispute reads. The admin queue is the only list surface; the guest
 * side only needs "is there an open dispute on this booking?" to swap
 * the report form for a "we're on it" note.
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

export const DISPUTES_LIST_LIMIT = 500;

/** Null = no database configured (page shows the noDb notice, not "all clear"). */
export async function listDisputesForAdmin(): Promise<readonly AdminDisputeRow[] | null> {
  const block = await adminGuard();
  // `no_db` is the one refusal the page must distinguish: it renders a
  // "needs a database" notice rather than an empty, reassuring list.
  if (block) return block.reason === 'no_db' ? null : [];
  try {
    const rows = await db
      .select({
        id: disputes.id,
        status: disputes.status,
        message: disputes.message,
        adminNotes: disputes.adminNotes,
        resolutionRefundSar: disputes.resolutionRefundSar,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        bookingId: bookings.id,
        // The GH- display code — what /admin/bookings and the guest's
        // email call it; the UUID capability stays out of admin chrome.
        bookingReference: bookings.referenceCode,
        bookingDate: bookings.date,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
        experienceSlug: experiences.slug,
        guestName: guests.name,
        // The booking's contact snapshot first (2026-07-28 fourth audit):
        // an email-OTP account's `guests.phone` is null by design, so
        // reading only that dropped the call link from the disputes
        // queue — leaving the operator working a live money dispute with
        // no way to phone the guest.
        guestPhone: sql<string | null>`coalesce(${bookings.contactPhone}, ${guests.phone})`,
        guestId: guests.id,
        guestAuthUserId: guests.authUserId,
        bookingStatus: bookings.status,
        bookingPaymentStatus: bookings.paymentStatus,
        bookingTotalAmountSar: bookings.totalAmount,
        bookingWalletAppliedSar: bookings.walletAppliedSar,
        bookingRefundDueSar: bookings.refundDueSar,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(disputes.guestId, guests.id))
      .orderBy(desc(disputes.createdAt))
      .limit(DISPUTES_LIST_LIMIT);
    return rows.map(
      ({
        guestId,
        guestAuthUserId,
        bookingStatus,
        bookingPaymentStatus,
        bookingTotalAmountSar,
        bookingWalletAppliedSar,
        bookingRefundDueSar,
        ...row
      }) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        guestPersonKey: guestAuthUserId ? authKey(guestAuthUserId) : guestKey(guestId),
        bookingAmountSar: bookingTotalAmountSar + bookingWalletAppliedSar,
        refundable: isDisputeRefundable({
          status: bookingStatus,
          paymentStatus: bookingPaymentStatus,
          refundDueSar: bookingRefundDueSar,
        }),
      }),
    );
  } catch (error) {
    // Rethrow — errors go to the admin boundary, not the empty state.
    reportError(error, { surface: 'disputes:listForAdmin' });
    throw error;
  }
}

/** Whether the booking already has an OPEN dispute (guest-side check). */
export async function hasOpenDisputeForBooking(reference: string): Promise<boolean> {
  if (!serverEnv.DATABASE_URL) return false;
  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true },
    });
    if (!booking) return false;
    const open = await db.query.disputes.findFirst({
      where: (d, { and: andOp }) => andOp(eq(d.bookingId, booking.id), eq(d.status, 'open')),
      columns: { id: true },
    });
    return Boolean(open);
  } catch (error) {
    reportError(error, { surface: 'disputes:hasOpen', reference });
    return false;
  }
}
