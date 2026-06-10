import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import type { Booking } from '@/db/schema';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { reportError } from '@/lib/log';

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
  /** Guest's name — used to prefill the payment-details step. */
  guestName: string;
  /** Guest's email if known — prefills the payment-details step. */
  guestEmail: string | null;
  /** Card scheme once settled (e.g. `MADA`, `VISA`, `MASTER`); null otherwise. */
  paymentBrand: string | null;
  /** When payment settled, ISO string; null until paid. */
  paidAt: string | null;
  createdAt: string;
}

export async function getBookingByReference(reference: string): Promise<BookingDetail | undefined> {
  if (!hasDb()) return undefined;
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.idempotencyKey, reference),
    with: {
      experience: { columns: { slug: true } },
      guest: { columns: { name: true, email: true } },
    },
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
    guestName: row.guest.name,
    guestEmail: row.guest.email,
    paymentBrand: row.paymentBrand,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Like {@link getBookingByReference}, but authorizes the *viewer* first —
 * returns the detail only when the caller owns the booking or holds it in
 * their last-booking cookie (see {@link bookingViewerCanAccess}). Use this
 * for any page that renders guest PII keyed off a URL reference; returns
 * undefined for an unauthorized viewer, which the pages render as the
 * generic / preview state (no PII leak).
 */
export async function getBookingByReferenceForViewer(
  reference: string,
): Promise<BookingDetail | undefined> {
  if (!hasDb()) return undefined;
  const owner = await db.query.bookings.findFirst({
    where: eq(bookings.idempotencyKey, reference),
    columns: { guestId: true },
  });
  if (!owner) return undefined;
  if (!(await bookingViewerCanAccess(reference, owner.guestId))) return undefined;
  return getBookingByReference(reference);
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
    with: {
      experience: { columns: { slug: true, titleEn: true, titleAr: true } },
      guest: { columns: { name: true, email: true } },
    },
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
    guestName: row.guest.name,
    guestEmail: row.guest.email,
    paymentBrand: row.paymentBrand,
    paidAt: row.paidAt?.toISOString() ?? null,
    experienceTitleEn: row.experience.titleEn,
    experienceTitleAr: row.experience.titleAr,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The host's WhatsApp-able contact phone for a booking — only for
 * bookings the host has accepted (confirmed/completed): a declined or
 * pending request must not leak the host's personal number. The phone
 * comes from the approved application (`host_applications.contact_phone`);
 * seeded demo hosts have no application and yield null.
 */
export async function getHostContactPhoneForBooking(reference: string): Promise<string | null> {
  if (!hasDb()) return null;
  try {
    const row = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { status: true },
      with: { experience: { columns: { hostId: true } } },
    });
    if (!row || (row.status !== 'confirmed' && row.status !== 'completed')) return null;
    const application = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.hostId, row.experience.hostId),
      columns: { contactPhone: true },
    });
    return application?.contactPhone ?? null;
  } catch (error) {
    reportError(error, { surface: 'bookings:getHostContact', reference });
    return null;
  }
}
