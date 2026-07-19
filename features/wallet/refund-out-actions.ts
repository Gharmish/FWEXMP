'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { executeRefund } from '@/features/bookings/lib/refund';
import { debitWallet } from '@/features/wallet/ledger';
import { getSessionGuestId } from '@/features/wallet/queries';

/**
 * The guest's half of the emergency-cancellation deal: after the admin
 * moved a cancelled booking's full payment into Gharmish Credit
 * (`refundMethod='wallet'`), the guest may instead move the CARD-charged
 * share back to their original payment method. This is a refund-to-source
 * gateway reversal — never a transfer to an arbitrary bank account (the
 * wallet stays non-withdrawable; SAMA posture).
 *
 * Money discipline: debit the wallet FIRST (`type='reversal'`, key
 * `refund-out:<bookingId>` — a double click lands on the unique index),
 * then run the gateway refund `card_only` (the wallet side is already
 * settled by the debit; the `auto` rails would credit it back and mint
 * money). If the gateway refuses, `executeRefund` stamps `refundDueSar`
 * and alerts the team — the guest sees "on its way", never a silent loss.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  reference: z.string().regex(UUID_RE),
  locale: z.enum(['en', 'ar']),
});

export type RefundToCardState =
  | { status: 'idle' }
  | { status: 'done'; outcome: 'refunded' | 'refund_pending'; amountSar: number }
  | {
      status: 'error';
      error:
        | 'not_found'
        | 'not_eligible'
        | 'insufficient_balance'
        | 'already_requested'
        | 'validation'
        | 'no_db'
        | 'server';
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function requestRefundToCard(
  _previous: RefundToCardState,
  formData: FormData,
): Promise<RefundToCardState> {
  const parsed = requestSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { status: 'error', error: 'validation' };
  const { reference } = parsed.data;
  if (!serverEnv.DATABASE_URL) return { status: 'error', error: 'no_db' };

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: {
        id: true,
        guestId: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        paymentReference: true,
        refundMethod: true,
      },
    });
    if (!booking) return { status: 'error', error: 'not_found' };
    // STRICT wallet ownership (same doctrine as the checkout actions):
    // a wallet belongs to the signed-in account, never to whoever holds
    // the booking cookie. Same shape as a missing booking either way.
    const sessionGuestId = await getSessionGuestId();
    if (!sessionGuestId || sessionGuestId !== booking.guestId) {
      return { status: 'error', error: 'not_found' };
    }

    // Only a wallet-refunded booking with a real card charge qualifies:
    // the gateway can reverse at most what it captured, so the credit's
    // wallet-funded share (if any) always stays as credit.
    const eligible =
      booking.refundMethod === 'wallet' &&
      booking.status === 'refunded' &&
      booking.paymentStatus === 'paid' &&
      booking.totalAmount > 0 &&
      booking.paymentReference !== null;
    if (!eligible) return { status: 'error', error: 'not_eligible' };

    let outcome: Awaited<ReturnType<typeof debitWallet>>;
    try {
      outcome = await debitWallet({
        guestId: booking.guestId,
        type: 'reversal',
        amountSar: booking.totalAmount,
        bookingId: booking.id,
        idempotencyKey: `refund-out:${booking.id}`,
        note: null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'error', error: 'already_requested' };
      throw error;
    }
    if (outcome === 'insufficient_balance') {
      return { status: 'error', error: 'insufficient_balance' };
    }

    const refund = await executeRefund(
      booking.id,
      booking.paymentReference,
      booking.totalAmount,
      null,
      'card_only',
    );

    revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
    revalidatePath('/[locale]/me/profile', 'page');
    return { status: 'done', outcome: refund, amountSar: booking.totalAmount };
  } catch (error) {
    reportError(error, { surface: 'wallet:refundToCard', reference });
    return { status: 'error', error: 'server' };
  }
}
