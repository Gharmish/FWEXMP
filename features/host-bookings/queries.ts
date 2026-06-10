import { desc, eq, inArray, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import { splitCommission } from '@/features/bookings/lib/availability';
import type { HostBookingRow } from '@/features/host-bookings/types';

/**
 * Host-scoped reads over bookings. Every helper resolves the caller's
 * `hosts.id` first (same chassis as features/host-experiences/queries),
 * so a host can never see another host's bookings — the WHERE clause is
 * `experiences.hostId = myHostId`, not anything the client supplies.
 *
 * PII note: the guest's phone is included only once a booking is
 * confirmed/completed (the host needs it to coordinate the day);
 * pending requests carry the name only.
 */

/** Same safety ceiling as the admin list — promote to pagination past it. */
const HOST_BOOKINGS_LIST_LIMIT = 500;

/** Statuses where the host legitimately needs the guest's contact. */
const CONTACT_VISIBLE_STATUSES: readonly HostBookingRow['status'][] = ['confirmed', 'completed'];

export async function listBookingsForHost(): Promise<readonly HostBookingRow[]> {
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId || !serverEnv.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        booking: bookings,
        experienceSlug: experiences.slug,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
        commissionBps: experiences.commissionBps,
        guestName: guests.name,
        guestPhone: guests.phone,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(eq(experiences.hostId, hostId))
      .orderBy(desc(bookings.createdAt))
      .limit(HOST_BOOKINGS_LIST_LIMIT);

    return rows.map<HostBookingRow>((row) => {
      const { payoutSar } = splitCommission(row.booking.totalAmount, row.commissionBps);
      const contactVisible = CONTACT_VISIBLE_STATUSES.includes(row.booking.status);
      return {
        id: row.booking.id,
        reference: row.booking.idempotencyKey,
        status: row.booking.status,
        paymentStatus: row.booking.paymentStatus,
        date: row.booking.date,
        startTime: row.booking.startTime,
        partySize: row.booking.partySize,
        totalAmountSar: row.booking.totalAmount,
        payoutSar,
        createdAt: row.booking.createdAt.toISOString(),
        experienceId: row.booking.experienceId,
        experienceSlug: row.experienceSlug,
        experienceTitleEn: row.experienceTitleEn,
        experienceTitleAr: row.experienceTitleAr,
        guestName: row.guestName,
        guestPhone: contactVisible ? row.guestPhone : null,
      };
    });
  } catch (error) {
    reportError(error, { surface: 'host-bookings:list' });
    return [];
  }
}

/**
 * Count of pending (request-mode) bookings awaiting this host's
 * decision — the dashboard badge that pulls hosts into /host/bookings.
 */
export async function countPendingRequestsForHost(): Promise<number> {
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId || !serverEnv.DATABASE_URL) return 0;
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(and(eq(experiences.hostId, hostId), inArray(bookings.status, ['pending'])));
    return count;
  } catch (error) {
    reportError(error, { surface: 'host-bookings:countPending' });
    return 0;
  }
}
