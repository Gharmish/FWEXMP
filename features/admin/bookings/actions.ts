'use server';

import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { refundBookingSchema, transitionBookingSchema } from '@/features/admin/bookings/schemas';
import { sourcesFor } from '@/features/bookings/lib/transitions';
import { ACTIVE_BOOKING_STATUSES, remainingCapacity } from '@/features/bookings/lib/availability';

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
  message?:
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'over_capacity'
    | 'validation'
    | 'server';
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
    // bookings haven't taken money yet (cancel, don't refund) and
    // `refunded` is terminal. `cancelled` is refundable only when the
    // guest had paid — the guest-cancellation flow leaves a paid
    // booking `cancelled` + `refundDueSar` when the automatic gateway
    // refund failed; this action records the manual reversal.
    const updated = await db
      .update(bookings)
      .set({ status: 'refunded', refundedAt: new Date(), refundDueSar: null })
      .where(
        and(
          eq(bookings.id, bookingId),
          or(
            inArray(bookings.status, ['confirmed', 'completed']),
            and(eq(bookings.status, 'cancelled'), eq(bookings.paymentStatus, 'paid')),
          ),
        ),
      )
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

/**
 * Move a booking along its lifecycle: confirm (pending → confirmed),
 * complete (confirmed → completed), or cancel (pending/confirmed →
 * cancelled). The allowed `from` states come from the transition map,
 * applied as a conditional UPDATE WHERE so a stale page or a double
 * click can't drive an illegal transition.
 *
 * Confirming is special: request-mode experiences accumulate `pending`
 * bookings with no capacity gate at request time, so the gate is here.
 * We lock the experience row, re-sum the active party sizes on the date
 * (excluding this booking), and refuse the confirm if it would push the
 * date over `maxGroupSize` — otherwise an admin could confirm more
 * pending requests than the experience can hold.
 */
export async function transitionBooking(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = transitionBookingSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    to: formValue(formData, 'to'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { bookingId, to, locale } = parsed.data;

  try {
    if (to === 'confirmed') {
      const outcome = await db.transaction(async (tx) => {
        const booking = await tx.query.bookings.findFirst({
          where: (b) => eq(b.id, bookingId),
          columns: { id: true, experienceId: true, date: true, partySize: true, status: true },
        });
        if (!booking) return 'not_found' as const;
        // Same conditional-transition guard as below, evaluated in-txn.
        if (!sourcesFor('confirmed').includes(booking.status)) return 'wrong_state' as const;

        const experience = await tx.query.experiences.findFirst({
          where: (e) => eq(e.id, booking.experienceId),
          columns: { id: true, maxGroupSize: true },
        });
        if (!experience) return 'not_found' as const;

        // Serialize against concurrent confirms and instant bookings for
        // this experience, then re-sum the date excluding this booking.
        await tx.execute(
          sql`select 1 from ${experiences} where ${experiences.id} = ${experience.id} for update`,
        );
        const [{ booked }] = await tx
          .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.experienceId, booking.experienceId),
              eq(bookings.date, booking.date),
              inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
              ne(bookings.id, bookingId),
            ),
          );
        if (remainingCapacity(experience.maxGroupSize, booked) < booking.partySize) {
          return 'over_capacity' as const;
        }
        await tx.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, bookingId));
        return 'ok' as const;
      });
      if (outcome !== 'ok') return { success: false, message: outcome };
    } else {
      const updated = await db
        .update(bookings)
        .set({ status: to })
        .where(and(eq(bookings.id, bookingId), inArray(bookings.status, [...sourcesFor(to)])))
        .returning({ id: bookings.id });
      if (updated.length === 0) {
        const exists = await db.query.bookings.findFirst({
          where: (b) => eq(b.id, bookingId),
          columns: { id: true },
        });
        return { success: false, message: exists ? 'wrong_state' : 'not_found' };
      }
    }
  } catch (error) {
    reportError(error, { surface: 'admin:transitionBooking', bookingId, to });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  redirect({ href: '/admin/bookings', locale });
}
