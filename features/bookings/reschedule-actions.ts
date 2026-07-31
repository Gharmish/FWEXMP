'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { rescheduleBookingSchema } from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { bookingOptions } from '@/features/bookings/lib/policy';
import {
  ACTIVE_BOOKING_STATUSES,
  isDateBookable,
  isHoldExpired,
  nowMinutesInRiyadh,
  remainingCapacity,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import {
  sendBookingRescheduledEmail,
  sendHostBookingRescheduledEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * Guest self-service reschedule: move a live booking to another
 * bookable date of the SAME experience, same party size, same price —
 * money never moves, so payment columns (and any issued invoice) are
 * untouched. Whether a move is allowed at all comes from the booking's
 * policy snapshot via `bookingOptions()` (the same verdict the page
 * used to render the option), capped at `MAX_RESCHEDULES` per booking.
 *
 * The target date must pass the same gates a NEW booking would
 * (schedule, blackouts, stop-sell, cutoff) and have capacity for the
 * party, checked under the experience row lock exactly like booking
 * creation — two guests can't both grab the last seats.
 *
 * Reminder flags reset on success so the hourly crons re-fire for the
 * new date (their ledger dedupe keys are date-scoped for this reason).
 *
 * Authorization matches cancellation: the caller must own the booking
 * or hold its reference in the last-booking cookie.
 */

export type RescheduleBookingState =
  | { success: true; newDate: string }
  | {
      success: false;
      message?:
        | 'no_db'
        | 'not_found'
        | 'wrong_state'
        | 'already_started'
        | 'window_passed'
        | 'limit_reached'
        | 'date_unavailable'
        | 'date_full'
        | 'validation'
        | 'server';
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function rescheduleBookingAsGuest(
  _previous: RescheduleBookingState,
  formData: FormData,
): Promise<RescheduleBookingState> {
  const parsed = rescheduleBookingSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
    newDate: formValue(formData, 'newDate'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  // The form's locale is validated but no longer drives the notification
  // language — senders read the guest's stored preference.
  const { reference, newDate } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  let oldDate: string;
  try {
    const booking = await db.query.bookings.findFirst({
      where: (b) => eq(b.idempotencyKey, reference),
      columns: {
        id: true,
        guestId: true,
        experienceId: true,
        status: true,
        paymentStatus: true,
        date: true,
        startTime: true,
        partySize: true,
        totalAmount: true,
        createdAt: true,
        paymentDeadline: true,
        policyTier: true,
        freeCancelHours: true,
        partialRefundHours: true,
        partialRefundBps: true,
        rescheduleCutoffHours: true,
        rescheduleCount: true,
      },
    });
    if (!booking) return { success: false, message: 'not_found' };
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Same shape as a missing booking — the reference can't be probed.
      return { success: false, message: 'not_found' };
    }

    const now = new Date();
    // A lapsed unpaid hold is about to be released by the cron; moving it
    // would resurrect a dead hold on a fresh date. Same rule the page uses
    // to hide the manage actions.
    if (booking.paymentStatus === 'unpaid' && isHoldExpired(booking.paymentDeadline, now)) {
      return { success: false, message: 'wrong_state' };
    }

    const { reschedule } = bookingOptions({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      dateStr: booking.date,
      startTime: booking.startTime,
      createdAt: booking.createdAt,
      totalAmountSar: booking.totalAmount,
      snapshot: booking,
      rescheduleCount: booking.rescheduleCount,
      now,
    });
    if (!reschedule.allowed) {
      return { success: false, message: reschedule.reason };
    }
    if (newDate === booking.date) {
      return { success: false, message: 'validation' };
    }

    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, booking.experienceId),
      columns: {
        id: true,
        maxGroupSize: true,
        startTime: true,
        bookingCutoffHours: true,
        availabilityWeekdays: true,
        blackoutDates: true,
        stopSellDates: true,
      },
    });
    if (!experience) return { success: false, message: 'not_found' };

    // The target date must be open to NEW bookings — schedule, blackout,
    // stop-sell, and the same lead-time cutoff the booking form enforces.
    const bookable = isDateBookable({
      dateStr: newDate,
      todayStr: todayInRiyadh(),
      availabilityWeekdays: experience.availabilityWeekdays,
      blackoutDates: experience.blackoutDates,
      stopSellDates: experience.stopSellDates,
      startTime: experience.startTime,
      nowMinutes: nowMinutesInRiyadh(),
      cutoffMinutes: experience.bookingCutoffHours * 60,
    });
    if (!bookable.ok) {
      return { success: false, message: 'date_unavailable' };
    }

    // Capacity + move under the experience row lock — identical discipline
    // to booking creation, so a concurrent booking/move for the same date
    // serializes instead of overbooking. The UPDATE re-asserts status,
    // current date, and the move count so a concurrent host/admin
    // transition (or a double-submitted move) loses cleanly.
    oldDate = booking.date;
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from ${experiences} where ${experiences.id} = ${experience.id} for update`,
      );
      const [{ booked }] = await tx
        .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.experienceId, experience.id),
            eq(bookings.date, newDate),
            inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
            holdStillCounts(),
            ne(bookings.id, booking.id),
          ),
        );
      if (remainingCapacity(experience.maxGroupSize, booked) < booking.partySize) {
        return 'full' as const;
      }
      const moved = await tx
        .update(bookings)
        .set({
          date: newDate,
          // The experience's CURRENT start time — the host may have moved
          // it since this booking was created.
          startTime: experience.startTime,
          rescheduledAt: new Date(),
          rescheduledFromDate: booking.date,
          rescheduleCount: booking.rescheduleCount + 1,
          // Re-arm both reminder crons for the new date.
          reminderSentAt: null,
          finalReminderSentAt: null,
        })
        .where(
          and(
            eq(bookings.id, booking.id),
            inArray(bookings.status, ['pending', 'confirmed']),
            eq(bookings.date, booking.date),
            eq(bookings.rescheduleCount, booking.rescheduleCount),
          ),
        )
        .returning({ id: bookings.id });
      return moved.length > 0 ? ('ok' as const) : ('stale' as const);
    });
    if (outcome === 'full') return { success: false, message: 'date_full' };
    if (outcome === 'stale') return { success: false, message: 'wrong_state' };
  } catch (error) {
    reportError(error, { surface: 'bookings:rescheduleAsGuest', reference });
    return { success: false, message: 'server' };
  }

  // Best-effort notifications — never fail a completed move over email.
  try {
    await sendBookingRescheduledEmail(reference, oldDate);
  } catch (error) {
    reportError(error, { surface: 'bookings:rescheduleEmail', reference });
  }
  try {
    await sendHostBookingRescheduledEmail(reference, oldDate);
  } catch (error) {
    reportError(error, { surface: 'bookings:rescheduleHostEmail', reference });
  }

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/host/bookings', 'page');
  return { success: true, newDate };
}
