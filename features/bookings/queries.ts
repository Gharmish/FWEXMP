import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import type { Booking } from '@/db/schema';

/**
 * Read-side for bookings — currently just a lookup by the
 * idempotencyKey we use as the public reference on the confirmation
 * page. Sample-data fallback returns undefined (we don't persist any
 * preview bookings in memory; the confirmation page renders generic
 * copy when this returns undefined).
 *
 * Once host dashboards land this grows getBookingsForGuest /
 * getBookingsForHost; for now we keep the surface small.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

export interface BookingDetail {
  id: string;
  reference: string;
  status: Booking['status'];
  paymentStatus: Booking['paymentStatus'];
  partySize: number;
  totalAmountSar: number;
  date: string;
  startTime: string;
  experienceSlug: string;
  createdAt: string;
}

export async function getBookingByReference(reference: string): Promise<BookingDetail | undefined> {
  if (!hasDb()) return undefined;
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.idempotencyKey, reference),
    with: { experience: { columns: { slug: true } } },
  });
  if (!row) return undefined;
  return {
    id: row.id,
    reference: row.idempotencyKey,
    status: row.status,
    paymentStatus: row.paymentStatus,
    partySize: row.partySize,
    totalAmountSar: row.totalAmount,
    date: row.date,
    startTime: row.startTime,
    experienceSlug: row.experience.slug,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A booking as the profile history list renders it — carries the bilingual experience title. */
export interface GuestBookingSummary extends BookingDetail {
  experienceTitleEn: string;
  experienceTitleAr: string;
}

/**
 * Every booking for a guest, newest first. Drives the booking-history
 * section on the profile page; empty when the DB isn't configured.
 */
export async function getBookingsForGuest(guestId: string): Promise<GuestBookingSummary[]> {
  if (!hasDb()) return [];
  const rows = await db.query.bookings.findMany({
    where: eq(bookings.guestId, guestId),
    orderBy: [desc(bookings.date), desc(bookings.createdAt)],
    with: { experience: { columns: { slug: true, titleEn: true, titleAr: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    reference: row.idempotencyKey,
    status: row.status,
    paymentStatus: row.paymentStatus,
    partySize: row.partySize,
    totalAmountSar: row.totalAmount,
    date: row.date,
    startTime: row.startTime,
    experienceSlug: row.experience.slug,
    experienceTitleEn: row.experience.titleEn,
    experienceTitleAr: row.experience.titleAr,
    createdAt: row.createdAt.toISOString(),
  }));
}
