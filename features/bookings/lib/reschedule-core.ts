import 'server-only';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
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
 * Guest-initiated reschedule, shared by the booking-page server action
 * (`reschedule-actions.ts`) and the WhatsApp support agent (phase 3).
 * Extracted verbatim 2026-08-21 — see cancel-core.ts for the rationale.
 * Callers do their own `revalidatePath`.
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

export interface RescheduleBookingCoreInput {
  reference: string;
  newDate: string;
  actor: 'guest' | 'agent';
  authorize: (guestId: string) => Promise<boolean>;
}

export async function rescheduleBookingCore(
  input: RescheduleBookingCoreInput,
): Promise<RescheduleBookingState> {
  const { reference, newDate } = input;
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
    if (!(await input.authorize(booking.guestId))) {
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
    reportError(error, { surface: `bookings:reschedule:${input.actor}`, reference });
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

  return { success: true, newDate };
}
