import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import { bookings, experiences, guests } from '@/db/schema';
import type { AdminBookingStatus } from '@/features/admin/bookings/types';
import { adminGuard } from '@/features/admin/guard';

/**
 * Admin guest directory — support + CRM lookups. PII note: returns the
 * guest's phone/email in cleartext; only reachable under the admin
 * layout gate (same posture as the bookings list).
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export interface AdminGuestRow {
  id: string;
  name: string;
  /** Null for email-OTP guests who haven't booked yet. */
  phone: string | null;
  email: string | null;
  bookings: number;
  spentSar: number;
  lastBookingAt: string | null;
  createdAt: string;
}

const GUESTS_LIST_LIMIT = 500;

export async function listGuestsForAdmin(query?: string): Promise<readonly AdminGuestRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const q = query?.trim();
    const where = q
      ? or(
          ilike(guests.name, `%${q}%`),
          ilike(guests.phone, `%${q}%`),
          ilike(guests.email, `%${q}%`),
        )
      : undefined;

    const rows = await db
      .select({
        id: guests.id,
        name: guests.name,
        phone: guests.phone,
        email: guests.email,
        createdAt: guests.createdAt,
        bookings: sql<number>`count(${bookings.id})::int`,
        spent: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} <> 'refunded'), 0)::int`,
        lastBookingAt: sql<Date | null>`max(${bookings.createdAt})`,
      })
      .from(guests)
      .leftJoin(bookings, eq(bookings.guestId, guests.id))
      .where(where)
      .groupBy(guests.id)
      .orderBy(desc(sql`max(${bookings.createdAt})`), desc(guests.createdAt))
      .limit(GUESTS_LIST_LIMIT);

    return rows.map<AdminGuestRow>((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      bookings: row.bookings,
      spentSar: row.spent,
      lastBookingAt: row.lastBookingAt ? new Date(row.lastBookingAt).toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    reportError(error, { surface: 'admin:listGuests' });
    return [];
  }
}

export interface AdminGuestBooking {
  id: string;
  reference: string;
  status: AdminBookingStatus;
  date: string;
  experienceTitleEn: string;
  experienceSlug: string;
  totalAmountSar: number;
}

export interface AdminGuestDetail extends AdminGuestRow {
  preferredLanguage: string;
  /** ISO timestamp of an active admin suspension, or null. */
  suspendedAt: string | null;
  bookingList: AdminGuestBooking[];
}

export async function getGuestDetail(id: string): Promise<AdminGuestDetail | undefined> {
  const block = await adminGuard();
  if (block) return undefined;
  try {
    const guest = await db.query.guests.findFirst({ where: (g) => eq(g.id, id) });
    if (!guest) return undefined;

    const rows = await db
      .select({
        id: bookings.id,
        reference: bookings.idempotencyKey,
        status: bookings.status,
        date: bookings.date,
        totalAmount: bookings.totalAmount,
        experienceTitleEn: experiences.titleEn,
        experienceSlug: experiences.slug,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(eq(bookings.guestId, id))
      .orderBy(desc(bookings.createdAt));

    const spent = rows
      .filter((r) => r.status !== 'refunded')
      .reduce((sum, r) => sum + r.totalAmount, 0);
    const lastBookingAt = rows[0]?.createdAt ?? null;

    return {
      id: guest.id,
      name: guest.name,
      phone: guest.phone,
      email: guest.email,
      preferredLanguage: guest.preferredLanguage,
      suspendedAt: guest.suspendedAt ? guest.suspendedAt.toISOString() : null,
      bookings: rows.length,
      spentSar: spent,
      lastBookingAt: lastBookingAt ? new Date(lastBookingAt).toISOString() : null,
      createdAt: guest.createdAt.toISOString(),
      bookingList: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        status: r.status,
        date: r.date,
        experienceTitleEn: r.experienceTitleEn,
        experienceSlug: r.experienceSlug,
        totalAmountSar: r.totalAmount,
      })),
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getGuestDetail', id });
    return undefined;
  }
}
