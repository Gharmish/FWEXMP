import { eq } from 'drizzle-orm';
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
  reference: string;
  status: Booking['status'];
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
    reference: row.idempotencyKey,
    status: row.status,
    partySize: row.partySize,
    totalAmountSar: row.totalAmount,
    date: row.date,
    startTime: row.startTime,
    experienceSlug: row.experience.slug,
    createdAt: row.createdAt.toISOString(),
  };
}
