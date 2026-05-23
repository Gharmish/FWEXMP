import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import type { AdminBookingRow } from '@/features/admin/bookings/types';

/**
 * Admin reads over bookings. Same two gates as the other admin
 * surfaces: caller must be admin, DB must be configured.
 *
 * The list is unfiltered by design at this scale — we have tens of
 * bookings, not tens of thousands. When volume justifies, add a
 * status filter on the route and a server-side WHERE.
 */

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
        experience: { columns: { slug: true, titleEn: true } },
        guest: { columns: { name: true, phone: true } },
      },
      orderBy: (b) => desc(b.createdAt),
    });
    return rows.map<AdminBookingRow>((row) => ({
      id: row.id,
      reference: row.idempotencyKey,
      status: row.status,
      date: row.date,
      startTime: row.startTime,
      partySize: row.partySize,
      totalAmountSar: row.totalAmount,
      currency: row.currency,
      paymentReference: row.paymentReference,
      createdAt: row.createdAt.toISOString(),
      experienceSlug: row.experience.slug,
      experienceTitleEn: row.experience.titleEn,
      guestName: row.guest.name,
      guestPhone: row.guest.phone,
    }));
  } catch (error) {
    reportError(error, { surface: 'admin:listBookings' });
    return [];
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
