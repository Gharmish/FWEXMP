'use server';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests, reviews } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { createReviewSchema, hostReplySchema } from '@/features/reviews/schemas';

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
    | 'expired'
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

/**
 * Edit an existing review inside its 24h window (BRIEF §8). Same
 * ownership rules as `submitReview` — the booking reference is the
 * capability, a signed-in caller must additionally own the booking.
 * Only the rating and the active-locale text change; `editableUntil`
 * is NOT extended (the window runs from first submission).
 */
export async function updateReview(
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

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db', values };

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, bookingReference),
      columns: { id: true, guestId: true },
    });
    if (!booking) return { success: false, message: 'not_found', values };

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

    const review = await db.query.reviews.findFirst({
      where: eq(reviews.bookingId, booking.id),
      columns: { id: true, editableUntil: true },
    });
    if (!review) return { success: false, message: 'not_found', values };
    if (review.editableUntil.getTime() <= Date.now()) {
      return { success: false, message: 'expired', values };
    }

    // Window re-checked in the WHERE so a request straddling the
    // deadline can't slip through after the read.
    const updated = await db
      .update(reviews)
      .set({
        rating,
        textEn: locale === 'en' ? (text ?? null) : undefined,
        textAr: locale === 'ar' ? (text ?? null) : undefined,
      })
      .where(and(eq(reviews.id, review.id), gt(reviews.editableUntil, new Date())))
      .returning({ id: reviews.id });
    if (updated.length === 0) return { success: false, message: 'expired', values };

    revalidatePath('/[locale]/me', 'page');
    revalidatePath('/[locale]/experiences/[slug]', 'page');
  } catch (error) {
    reportError(error, { surface: 'reviews:updateReview', bookingReference });
    return { success: false, message: 'server', values };
  }

  redirect({ href: '/me', locale });
}

// ---------- host reply ----------

/**
 * One host reply per review (BRIEF §8). Ownership is the experience's
 * host: the caller's `hosts.userId` must match, resolved from the
 * session — never the form. The conditional UPDATE on `hostReply IS
 * NULL` makes the one-reply rule race-proof (a second tab reads
 * `already_replied`). Hidden reviews can't be replied to (the guest
 * never sees them, so a reply would dangle).
 */
export interface HostReplyState {
  success: boolean;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'already_replied' | 'validation' | 'server';
}

export async function replyToReview(
  _previous: HostReplyState,
  formData: FormData,
): Promise<HostReplyState> {
  const parsed = hostReplySchema.safeParse({
    reviewId: formValue(formData, 'reviewId'),
    reply: formValue(formData, 'reply'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { reviewId, reply } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { success: false, message: 'forbidden' };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    if (!host) return { success: false, message: 'forbidden' };

    const review = await db.query.reviews.findFirst({
      where: (r) => eq(r.id, reviewId),
      columns: { id: true, hostReply: true, hiddenAt: true, experienceId: true },
      with: { experience: { columns: { hostId: true, slug: true } } },
    });
    // Foreign and missing reviews are indistinguishable on purpose.
    if (!review || review.experience.hostId !== host.id || review.hiddenAt) {
      return { success: false, message: 'not_found' };
    }
    if (review.hostReply) return { success: false, message: 'already_replied' };

    const updated = await db
      .update(reviews)
      .set({ hostReply: reply })
      .where(and(eq(reviews.id, reviewId), isNull(reviews.hostReply)))
      .returning({ id: reviews.id });
    if (updated.length === 0) return { success: false, message: 'already_replied' };

    revalidatePath('/[locale]/host/reviews', 'page');
    revalidatePath('/[locale]/experiences/[slug]', 'page');
  } catch (error) {
    reportError(error, { surface: 'reviews:replyToReview', reviewId });
    return { success: false, message: 'server' };
  }

  return { success: true };
}
