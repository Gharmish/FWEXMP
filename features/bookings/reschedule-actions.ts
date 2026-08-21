'use server';

import { revalidatePath } from 'next/cache';
import { serverEnv } from '@/lib/env';
import { rescheduleBookingSchema } from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import {
  rescheduleBookingCore,
  type RescheduleBookingState,
} from '@/features/bookings/lib/reschedule-core';

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

export type { RescheduleBookingState } from '@/features/bookings/lib/reschedule-core';

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

  const outcome = await rescheduleBookingCore({
    reference,
    newDate,
    actor: 'guest',
    authorize: (guestId) => bookingViewerCanAccess(reference, guestId),
  });
  if (!outcome.success) return outcome;

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/host/bookings', 'page');
  return { success: true, newDate };
}
