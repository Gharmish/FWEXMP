'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests, reviews } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { createReviewSchema } from '@/features/reviews/schemas';

/** 24h edit cooldown (BRIEF §8). */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * On success the action throws (Next.js `redirect`) before returning, so
 * an observable return value is always one of the error shapes. `success`
 * stays on the type only to satisfy the useActionState initial-value
 * contract — same convention as the booking-request action.
 */
export interface SubmitReviewState {
  success: false;
  message?:
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'already_reviewed'
    | 'forbidden'
    | 'validation'
    | 'server';
  fields?: Partial<Record<'rating' | 'text', string>>;
  values?: { rating?: string; text?: string };
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitReview(
  _previous: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  const values = { rating: formValue(formData, 'rating'), text: formValue(formData, 'text') };

  const parsed = createReviewSchema.safeParse({
    bookingReference: formValue(formData, 'bookingReference'),
    rating: formValue(formData, 'rating'),
    text: formValue(formData, 'text'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    const fields: SubmitReviewState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'rating' || key === 'text') fields[key] = issue.message;
    }
    return { success: false, message: 'validation', fields, values };
  }

  const { bookingReference, rating, text, locale } = parsed.data;

  if (!serverEnv.DATABASE_URL) {
    return { success: false, message: 'no_db', values };
  }

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, bookingReference),
      columns: { id: true, guestId: true, experienceId: true, status: true },
    });
    if (!booking) return { success: false, message: 'not_found', values };

    // Ownership: the booking reference is a capability that anonymous
    // guests legitimately hold (they book without an account). But a
    // *signed-in* caller must own the booking — otherwise anyone who
    // sees someone else's reference (shared link, screenshot) could post
    // a review under that guest's identity. So if there's a session,
    // require the caller's guest row to be the one on the booking.
    const authUserId = (await getCurrentUser())?.id ?? null;
    if (authUserId) {
      const caller = await db.query.guests.findFirst({
        where: eq(guests.authUserId, authUserId),
        columns: { id: true },
      });
      if (!caller || caller.id !== booking.guestId) {
        return { success: false, message: 'forbidden', values };
      }
    }

    // A review is gated by a *completed* booking (BRIEF §8).
    if (booking.status !== 'completed') {
      return { success: false, message: 'wrong_state', values };
    }

    // One review per booking — the column is UNIQUE, but check first
    // for a clean message rather than relying on the constraint error.
    const existing = await db.query.reviews.findFirst({
      where: eq(reviews.bookingId, booking.id),
      columns: { id: true },
    });
    if (existing) return { success: false, message: 'already_reviewed', values };

    await db.insert(reviews).values({
      bookingId: booking.id,
      guestId: booking.guestId,
      experienceId: booking.experienceId,
      rating,
      textEn: locale === 'en' ? (text ?? null) : null,
      textAr: locale === 'ar' ? (text ?? null) : null,
      editableUntil: new Date(Date.now() + EDIT_WINDOW_MS),
    });
  } catch (error) {
    // Unique-violation race (two tabs submitting at once) reads as a
    // duplicate; surface it as already-reviewed rather than a 500.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return { success: false, message: 'already_reviewed', values };
    }
    reportError(error, { surface: 'reviews:submitReview', bookingReference });
    return { success: false, message: 'server', values };
  }

  redirect({ href: '/me', locale });
}
