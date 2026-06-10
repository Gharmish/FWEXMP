import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { splitCommission } from '@/features/bookings/lib/availability';
import type { AdminBookingRow } from '@/features/admin/bookings/types';

/**
 * Admin reads over bookings. Same two gates as the other admin
 * surfaces: caller must be admin, DB must be configured.
 *
 * The list is unfiltered by design at this scale — we have tens of
 * bookings, not tens of thousands. When volume justifies, add a
 * status filter on the route and a server-side WHERE.
 *
 * PII note: this surface returns the guest's phone number in
 * cleartext. The admin layout gate is the only thing protecting it —
 * do not call `listBookingsForAdmin` from anywhere except a route
 * that's a child of `app/[locale]/admin/`.
 */

/** Safety cap on the unfiltered list. We assume hundreds at launch;
 * this is a hard ceiling so a misconfigured page never renders the
 * entire table. Promote to a filtered/paginated query when we cross it. */
const BOOKINGS_LIST_LIMIT = 500;

export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db';
}

async function adminGuard(): Promise<AdminGuardFailure | null> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) return { reason: 'not_admin' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}

export async function listBookingsForAdmin(): Promise<readonly AdminBookingRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db.query.bookings.findMany({
      with: {
        experience: { columns: { slug: true, titleEn: true, commissionBps: true } },
        guest: { columns: { name: true, phone: true } },
      },
      orderBy: (b) => desc(b.createdAt),
      limit: BOOKINGS_LIST_LIMIT,
    });
    return rows.map<AdminBookingRow>((row) => {
      const { commissionSar, payoutSar } = splitCommission(
        row.totalAmount,
        row.experience.commissionBps,
      );
      return {
        id: row.id,
        reference: row.idempotencyKey,
        status: row.status,
        paymentStatus: row.paymentStatus,
        refundDueSar: row.refundDueSar,
        date: row.date,
        startTime: row.startTime,
        partySize: row.partySize,
        totalAmountSar: row.totalAmount,
        commissionSar,
        payoutSar,
        commissionBps: row.experience.commissionBps,
        currency: row.currency,
        paymentReference: row.paymentReference,
        createdAt: row.createdAt.toISOString(),
        experienceSlug: row.experience.slug,
        experienceTitleEn: row.experience.titleEn,
        guestName: row.guest.name,
        guestPhone: row.guest.phone,
      };
    });
  } catch (error) {
    reportError(error, { surface: 'admin:listBookings' });
    return [];
  }
}

/** Single booking by id for the admin detail page. */
export async function getAdminBookingById(id: string): Promise<AdminBookingRow | undefined> {
  const block = await adminGuard();
  if (block) return undefined;
  try {
    const row = await db.query.bookings.findFirst({
      where: (b) => eq(b.id, id),
      with: {
        experience: { columns: { slug: true, titleEn: true, commissionBps: true } },
        guest: { columns: { name: true, phone: true } },
      },
    });
    if (!row) return undefined;
    const { commissionSar, payoutSar } = splitCommission(
      row.totalAmount,
      row.experience.commissionBps,
    );
    return {
      id: row.id,
      reference: row.idempotencyKey,
      status: row.status,
      paymentStatus: row.paymentStatus,
      refundDueSar: row.refundDueSar,
      date: row.date,
      startTime: row.startTime,
      partySize: row.partySize,
      totalAmountSar: row.totalAmount,
      commissionSar,
      payoutSar,
      commissionBps: row.experience.commissionBps,
      currency: row.currency,
      paymentReference: row.paymentReference,
      createdAt: row.createdAt.toISOString(),
      experienceSlug: row.experience.slug,
      experienceTitleEn: row.experience.titleEn,
      guestName: row.guest.name,
      guestPhone: row.guest.phone,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getBookingById', id });
    return undefined;
  }
}

/** Coarse counts so the list page can show "{n} pending · {n} confirmed". */
export interface AdminBookingTotals {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  refunded: number;
}

export function totalsFromRows(rows: readonly AdminBookingRow[]): AdminBookingTotals {
  const out: AdminBookingTotals = {
    total: rows.length,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    refunded: 0,
  };
  for (const row of rows) {
    out[row.status]++;
  }
  return out;
}
