'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { refundBookingSchema } from '@/features/admin/bookings/schemas';

/**
 * Admin booking actions.
 *
 *   - Refund: flip `bookings.status` from `confirmed`/`completed` to
 *     `refunded` and stamp `refundedAt`. The status enum is the source
 *     of truth — Moyasar reversal is a separate concern (we don't have
 *     an automated path yet; the admin issues the refund out-of-band
 *     through Moyasar's dashboard, then runs this action to record it).
 *
 * Same chassis as the other admin actions: caller must be admin, DB
 * must be configured, conditional UPDATE WHERE protects against races.
 */

export interface AdminBookingActionResult {
  success: false;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'validation' | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<
  { adminUserId: string } | { error: AdminBookingActionResult }
> {
  const admin = await getCurrentUser();
  // Null check first so TS narrows `admin` before the role check reads `.id`.
  if (!admin || !isAdminUser(admin)) {
    return { error: { success: false, message: 'forbidden' } };
  }
  if (!serverEnv.DATABASE_URL) {
    return { error: { success: false, message: 'no_db' } };
  }
  return { adminUserId: admin.id };
}

export async function refundBooking(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = refundBookingSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { bookingId, locale } = parsed.data;

  try {
    // Conditional update: only flips refundable statuses. `pending`
    // bookings haven't taken money yet (cancel, don't refund);
    // `cancelled` / `refunded` are terminal.
    const updated = await db
      .update(bookings)
      .set({ status: 'refunded', refundedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['confirmed', 'completed'])))
      .returning({ id: bookings.id });
    if (updated.length === 0) {
      const exists = await db.query.bookings.findFirst({
        where: (b) => eq(b.id, bookingId),
        columns: { id: true },
      });
      return { success: false, message: exists ? 'wrong_state' : 'not_found' };
    }
  } catch (error) {
    reportError(error, { surface: 'admin:refundBooking', bookingId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  redirect({ href: '/admin/bookings', locale });
}
