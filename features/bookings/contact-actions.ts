'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { normalizeToE164 } from '@/lib/phone';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { isHoldExpired } from '@/features/bookings/lib/availability';

/**
 * Contact typo safety net (2026-08-28 audit): every lifecycle
 * notification goes to the unverified email/phone typed at booking, so
 * one typo orphans the booking. While nothing final has been sent —
 * the request is still pending, or the approved/instant booking is
 * still inside its payment window — the guest can correct them from
 * the confirmation page.
 *
 * Writes:
 *  - phone → `bookings.contactPhone`, the per-booking contact snapshot
 *    (NEVER `guests.phone`, which is an identity key — see the schema
 *    note on the column).
 *  - email → `guests.email`, only while the guest row is NOT
 *    account-linked: on a linked row the email came from the verified
 *    account and this unverified form must not overwrite it (same
 *    posture as the identity-linking rule, 2026-07-28 audit).
 *
 * Authorization is `bookingViewerCanAccess` ONLY — deliberately not
 * the signed link token: the token travels inside emails and WhatsApp
 * messages, and redirecting a booking's notifications is exactly what
 * a forwarded link must never be able to do.
 */

/** Optional-but-one contact fields; same shapes as `bookingRequestSchema`. */
const updateBookingContactSchema = z
  .object({
    reference: z.string().uuid(),
    locale: z.enum(['en', 'ar']),
    email: z
      .string()
      .trim()
      .max(254)
      .transform((raw, ctx) => {
        if (!raw) return undefined;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
          ctx.addIssue({ code: 'custom', message: 'invalid_email' });
          return z.NEVER;
        }
        return raw.toLowerCase();
      }),
    phone: z
      .string()
      .trim()
      .transform((raw, ctx) => {
        if (!raw) return undefined;
        const e164 = normalizeToE164(raw);
        if (!e164) {
          ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
          return z.NEVER;
        }
        return e164;
      }),
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['email'] });
    }
  });

export type UpdateBookingContactState =
  | { success: true }
  | {
      success: false;
      message?:
        | 'forbidden'
        | 'no_db'
        | 'not_found'
        | 'wrong_state'
        | 'account_email'
        | 'validation'
        | 'server';
      fields?: Partial<Record<'email' | 'phone', string>>;
      values?: { email?: string; phone?: string };
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function updateBookingContact(
  _previous: UpdateBookingContactState,
  formData: FormData,
): Promise<UpdateBookingContactState> {
  const values = { email: formValue(formData, 'email'), phone: formValue(formData, 'phone') };

  const parsed = updateBookingContactSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
    ...values,
  });
  if (!parsed.success) {
    const fields: Partial<Record<'email' | 'phone', string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'email' || key === 'phone') fields[key] = issue.message;
    }
    return { success: false, message: 'validation', fields, values };
  }
  const { reference, email, phone } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db', values };

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: {
        id: true,
        guestId: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        settleAnomalyAt: true,
        checkoutSupersededAt: true,
      },
      with: { guest: { columns: { authUserId: true } } },
    });
    if (!booking) return { success: false, message: 'not_found', values };

    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      return { success: false, message: 'forbidden', values };
    }

    // Only while the contact details still matter for what happens next:
    // a pending request, or an approved/instant booking inside a live
    // payment window. Everything later (paid, cancelled, lapsed) has
    // already used them.
    // Mirrors the confirmation page's rule: `unpaid`, or a `processing`
    // row whose checkout was merely prepared (the pay page does that on
    // load now) — never one with an unmatched capture or a retired
    // checkout. The page's `?payment=` return hint only shapes copy.
    const liveHold =
      booking.paymentDeadline !== null && !isHoldExpired(booking.paymentDeadline, new Date());
    const awaitingPayment =
      booking.status === 'confirmed' &&
      liveHold &&
      (booking.paymentStatus === 'unpaid' ||
        (booking.paymentStatus === 'processing' &&
          booking.settleAnomalyAt === null &&
          booking.checkoutSupersededAt === null));
    if (booking.status !== 'pending' && !awaitingPayment) {
      return { success: false, message: 'wrong_state', values };
    }

    if (email && booking.guest.authUserId) {
      // Account-linked rows carry the verified account email.
      return { success: false, message: 'account_email', values };
    }

    if (phone) {
      await db.update(bookings).set({ contactPhone: phone }).where(eq(bookings.id, booking.id));
    }
    if (email) {
      // The `authUserId IS NULL` guard is re-applied in the WHERE so a
      // claim landing between the read and this write can't be raced.
      await db
        .update(guests)
        .set({ email })
        .where(and(eq(guests.id, booking.guestId), isNull(guests.authUserId)));
    }
  } catch (error) {
    reportError(error, { surface: 'bookings:updateContact', reference });
    return { success: false, message: 'server', values };
  }

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  return { success: true };
}
