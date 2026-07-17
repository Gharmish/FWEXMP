import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, disputes, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

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
  bookingReference: string;
  bookingDate: string;
  experienceTitleEn: string;
  experienceSlug: string;
  guestName: string;
  guestPhone: string | null;
}

const DISPUTES_LIST_LIMIT = 500;

export async function listDisputesForAdmin(): Promise<readonly AdminDisputeRow[]> {
  const user = await getCurrentUser();
  if (!isAdminUser(user) || !serverEnv.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: disputes.id,
        status: disputes.status,
        message: disputes.message,
        adminNotes: disputes.adminNotes,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        bookingReference: bookings.idempotencyKey,
        bookingDate: bookings.date,
        experienceTitleEn: experiences.titleEn,
        experienceSlug: experiences.slug,
        guestName: guests.name,
        guestPhone: guests.phone,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(disputes.guestId, guests.id))
      .orderBy(desc(disputes.createdAt))
      .limit(DISPUTES_LIST_LIMIT);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    }));
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
