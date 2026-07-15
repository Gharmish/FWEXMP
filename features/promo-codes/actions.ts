'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, promoCodes } from '@/db/schema';
import { reportError } from '@/lib/log';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { recordPaymentEvent } from '@/features/payments/ledger';
import { computeDiscountSar } from '@/features/promo-codes/lib/discount';
import { PROMO_REDEEMED_STATUSES } from '@/features/promo-codes/queries';
import { applyPromoSchema, removePromoSchema } from '@/features/promo-codes/schemas';

/**
 * Guest-facing promo apply / remove, driven from the payment step. Both
 * mutate the booking's charged `total_amount` and its promo snapshot, so
 * every guard the checkout enforces applies here too (viewer access, not
 * already paid, live hold). The cap check runs under a `FOR UPDATE` lock
 * on the promo row so a redemption limit can't be oversubscribed by
 * concurrent checkouts — the same lock-anchor pattern the overbook guard
 * uses.
 *
 * A live checkout is NOT a blocker: changing the total while one is in
 * flight SUPERSEDES it — the booking drops from `processing` back to
 * `unpaid`, the supersession is ledgered, and the client tears the stale
 * widget down (`checkoutSuperseded` → reload), so the next "continue"
 * prepares a fresh checkout at the new amount. If the old checkout is
 * somehow still paid (second tab), settle's amount-mismatch guard
 * refuses it and alerts the team — money never settles at a stale total.
 */

export type PromoErrorCode =
  | 'invalid'
  | 'below_min'
  | 'exhausted'
  | 'already_paid'
  /** A fresh checkout is in flight — the total must not shift under it. */
  | 'checkout_in_progress'
  | 'unavailable'
  | 'not_found'
  | 'validation'
  | 'no_db'
  | 'server';

export type PromoActionState =
  | { status: 'idle' }
  | {
      status: 'applied';
      code: string;
      discountSar: number;
      totalSar: number;
      /** A live checkout was superseded — the client must tear down the stale widget. */
      checkoutSuperseded?: boolean;
    }
  | { status: 'removed'; checkoutSuperseded?: boolean }
  | {
      status: 'error';
      error: PromoErrorCode;
      minTotalSar?: number;
      /** The attempted code, echoed so a failed apply doesn't wipe the field. */
      code?: string;
    };

function err(error: PromoErrorCode, minTotalSar?: number, code?: string): PromoActionState {
  return {
    status: 'error',
    error,
    ...(minTotalSar != null ? { minTotalSar } : {}),
    ...(code ? { code } : {}),
  };
}

function revalidateBookingSurfaces(): void {
  revalidatePath('/[locale]/book/[reference]/pay', 'page');
  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
}

export async function applyPromo(
  _previous: PromoActionState,
  formData: FormData,
): Promise<PromoActionState> {
  // Echo the attempted code on every failure — the uncontrolled input
  // resets after the action, and retyping a code because of a typo in
  // one character is checkout friction we don't need.
  const raw = formData.get('code');
  const attempted = typeof raw === 'string' ? raw : '';
  const fail = (error: PromoErrorCode, minTotalSar?: number) => err(error, minTotalSar, attempted);
  if (!serverEnv.DATABASE_URL) return fail('no_db');

  const parsed = applyPromoSchema.safeParse({
    reference: formData.get('reference'),
    code: formData.get('code'),
    slug: formData.get('slug') || undefined,
    locale: formData.get('locale'),
  });
  if (!parsed.success) return fail('validation');
  const input = parsed.data;

  try {
    // Ownership + not-paid + live-hold + no-fresh-checkout guards, before
    // we take any lock.
    const existing = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, input.reference),
      columns: {
        id: true,
        guestId: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        checkoutId: true,
      },
    });
    if (!existing) return fail('not_found');
    if (!(await bookingViewerCanAccess(input.reference, existing.guestId)))
      return fail('not_found');
    if (existing.paymentStatus === 'paid') return fail('already_paid');
    if (existing.status !== 'confirmed') return fail('unavailable');
    if (
      (existing.paymentStatus === 'unpaid' || existing.paymentStatus === 'failed') &&
      isHoldExpired(existing.paymentDeadline, new Date())
    ) {
      return fail('unavailable');
    }
    // Set inside the transaction when a live checkout is superseded;
    // ledgered after commit (best-effort, mirrors createCheckout).
    let superseded: { bookingId: string; checkoutId: string; amountSar: number } | null = null;

    const outcome = await db.transaction(async (tx) => {
      // Lock the booking and re-read the money-relevant fields so a
      // concurrent settle/apply can't race the discount write.
      const [booking] = await tx
        .select({
          id: bookings.id,
          totalAmount: bookings.totalAmount,
          discountSar: bookings.discountSar,
          paymentStatus: bookings.paymentStatus,
          status: bookings.status,
          checkoutId: bookings.checkoutId,
        })
        .from(bookings)
        .where(eq(bookings.idempotencyKey, input.reference))
        .for('update');
      if (!booking) return fail('not_found');
      if (booking.paymentStatus === 'paid') return fail('already_paid');
      if (booking.status !== 'confirmed') return fail('unavailable');

      // Lock the promo row: the cap re-count below must serialize against
      // other checkouts redeeming the same code.
      const [promo] = await tx
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, input.code))
        .for('update');
      const now = new Date();
      if (
        !promo ||
        !promo.active ||
        (promo.startsAt && promo.startsAt.getTime() > now.getTime()) ||
        (promo.endsAt && promo.endsAt.getTime() <= now.getTime())
      ) {
        return fail('invalid');
      }

      // Discount is computed on the PRE-discount base so re-applying or
      // swapping a code is idempotent.
      const baseSar = booking.totalAmount + booking.discountSar;
      if (promo.minTotalSar != null && baseSar < promo.minTotalSar) {
        return fail('below_min', promo.minTotalSar);
      }

      if (promo.maxRedemptions != null) {
        const [{ used }] = await tx
          .select({ used: sql<number>`count(*)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.promoCodeId, promo.id),
              inArray(bookings.status, [...PROMO_REDEEMED_STATUSES]),
              ne(bookings.id, booking.id),
            ),
          );
        if (used >= promo.maxRedemptions) return fail('exhausted');
      }

      const discountSar = computeDiscountSar(baseSar, {
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      });
      if (discountSar <= 0) return fail('invalid');
      const totalSar = baseSar - discountSar;

      // A live checkout was prepared at the old total — supersede it in
      // the same locked write that changes the amount, so no window
      // exists where the widget's checkout and the booking's total agree.
      const superseding = booking.paymentStatus === 'processing';
      if (superseding && booking.checkoutId) {
        superseded = {
          bookingId: booking.id,
          checkoutId: booking.checkoutId,
          amountSar: booking.totalAmount,
        };
      }
      await tx
        .update(bookings)
        .set({
          totalAmount: totalSar,
          discountSar,
          promoCodeId: promo.id,
          promoCode: promo.code,
          ...(superseding ? { paymentStatus: 'unpaid' as const } : {}),
        })
        .where(eq(bookings.id, booking.id));

      return {
        status: 'applied',
        code: promo.code,
        discountSar,
        totalSar,
        checkoutSuperseded: superseding,
      } as const;
    });

    if (outcome.status === 'applied') {
      // Ledger the supersession (best-effort, like createCheckout's) so a
      // late capture on the old checkout stays traceable in reconciliation.
      // (Widened const: TS can't see the assignment inside the tx closure.)
      const s = superseded as { bookingId: string; checkoutId: string; amountSar: number } | null;
      if (s) {
        try {
          await recordPaymentEvent({
            bookingId: s.bookingId,
            type: 'checkout_superseded',
            amountSar: s.amountSar,
            gatewayId: s.checkoutId,
          });
        } catch (error) {
          reportError(error, { surface: 'promo:apply:ledger', reference: input.reference });
        }
      }
      revalidateBookingSurfaces();
    }
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'promo:apply', reference: input.reference });
    return fail('server');
  }
}

export async function removePromo(
  _previous: PromoActionState,
  formData: FormData,
): Promise<PromoActionState> {
  if (!serverEnv.DATABASE_URL) return err('no_db');

  const parsed = removePromoSchema.safeParse({
    reference: formData.get('reference'),
    slug: formData.get('slug') || undefined,
    locale: formData.get('locale'),
  });
  if (!parsed.success) return err('validation');
  const input = parsed.data;

  try {
    const existing = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, input.reference),
      columns: { id: true, guestId: true, paymentStatus: true, checkoutId: true },
    });
    if (!existing) return err('not_found');
    if (!(await bookingViewerCanAccess(input.reference, existing.guestId))) return err('not_found');
    if (existing.paymentStatus === 'paid') return err('already_paid');

    // Same supersession as applyPromo, for the same reason in reverse:
    // removing a code RAISES the total, and a checkout prepared for the
    // discounted amount would settle short against it.
    let superseded: { bookingId: string; checkoutId: string; amountSar: number } | null = null;

    const outcome = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select({
          id: bookings.id,
          totalAmount: bookings.totalAmount,
          discountSar: bookings.discountSar,
          paymentStatus: bookings.paymentStatus,
          checkoutId: bookings.checkoutId,
        })
        .from(bookings)
        .where(eq(bookings.idempotencyKey, input.reference))
        .for('update');
      if (!booking) return err('not_found');
      if (booking.paymentStatus === 'paid') return err('already_paid');
      // Nothing applied — a no-op success so the UI just settles.
      if (booking.discountSar === 0) return { status: 'removed' } as const;

      const superseding = booking.paymentStatus === 'processing';
      if (superseding && booking.checkoutId) {
        superseded = {
          bookingId: booking.id,
          checkoutId: booking.checkoutId,
          amountSar: booking.totalAmount,
        };
      }
      await tx
        .update(bookings)
        .set({
          totalAmount: booking.totalAmount + booking.discountSar,
          discountSar: 0,
          promoCodeId: null,
          promoCode: null,
          ...(superseding ? { paymentStatus: 'unpaid' as const } : {}),
        })
        .where(eq(bookings.id, booking.id));
      return { status: 'removed', checkoutSuperseded: superseding } as const;
    });

    if (outcome.status === 'removed') {
      const s = superseded as { bookingId: string; checkoutId: string; amountSar: number } | null;
      if (s) {
        try {
          await recordPaymentEvent({
            bookingId: s.bookingId,
            type: 'checkout_superseded',
            amountSar: s.amountSar,
            gatewayId: s.checkoutId,
          });
        } catch (error) {
          reportError(error, { surface: 'promo:remove:ledger', reference: input.reference });
        }
      }
      revalidateBookingSurfaces();
    }
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'promo:remove', reference: input.reference });
    return err('server');
  }
}
