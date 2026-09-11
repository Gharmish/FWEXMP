'use server';

import { isUniqueViolation } from '@/lib/db-errors';
import { UUID_RE } from '@/lib/uuid';
import { getPlatformSettings } from '@/lib/platform-settings';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, walletLedger } from '@/db/schema';
import { reportError } from '@/lib/log';
import { executeRefund } from '@/features/bookings/lib/refund';
import { debitWalletTx } from '@/features/wallet/ledger';
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

const requestSchema = z.object({
  reference: z.string().regex(UUID_RE),
  locale: z.enum(['en', 'ar']),
});

export type RefundToCardState =
  | { status: 'idle' }
  | { status: 'done'; outcome: 'refunded' | 'refund_pending'; amountSar: number }
  | {
      status: 'error';
      message:
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
export async function requestRefundToCard(
  _previous: RefundToCardState,
  formData: FormData,
): Promise<RefundToCardState> {
  const parsed = requestSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { status: 'error', message: 'validation' };
  const { reference } = parsed.data;
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };

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
    if (!booking) return { status: 'error', message: 'not_found' };
    // STRICT wallet ownership (same doctrine as the checkout actions):
    // a wallet belongs to the signed-in account, never to whoever holds
    // the booking cookie. Same shape as a missing booking either way.
    const sessionGuestId = await getSessionGuestId();
    if (!sessionGuestId || sessionGuestId !== booking.guestId) {
      return { status: 'error', message: 'not_found' };
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
    if (!eligible) return { status: 'error', message: 'not_eligible' };
    // Refund-out is a refund-to-SOURCE gateway reversal — never a transfer
    // to an arbitrary bank account (SAMA posture, this module's contract).
    // While refunds are wired by hand the gateway leg is skipped, which
    // would have turned "move it back to my card" into a bank transfer to
    // a guest-supplied IBAN (2026-09 engineering audit MONEY-04). The
    // credit simply stays spendable until the gateway rail is back on.
    const { refundsViaBankTransfer } = await getPlatformSettings();
    if (refundsViaBankTransfer) return { status: 'error', message: 'not_eligible' };

    let outcome: 'ok' | 'insufficient_balance' | 'source_cap';
    try {
      outcome = await db.transaction(async (tx) => {
        // Serialize with every other wallet movement for this guest —
        // same advisory lock `debitWalletTx` takes (re-entrant in-tx).
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${'wallet:' + booking.guestId}))`,
        );
        // SOURCE cap (2026-07-20 audit): the balance is a fungible SUM,
        // so a balance check alone would let a guest whose refund credit
        // is already spent cash out goodwill/promo credit instead —
        // converting explicitly non-withdrawable credit into real money.
        // Account-wide invariant: lifetime refund-outs may never exceed
        // lifetime refund credits.
        const [caps] = await tx
          .select({
            refundCredits: sql<number>`coalesce(sum(${walletLedger.amountSar}) filter (where ${walletLedger.type} = 'refund_credit'), 0)::int`,
            refundOuts: sql<number>`coalesce(sum(-${walletLedger.amountSar}) filter (where ${walletLedger.type} = 'reversal' and ${walletLedger.idempotencyKey} like 'refund-out:%'), 0)::int`,
          })
          .from(walletLedger)
          .where(eq(walletLedger.guestId, booking.guestId));
        if ((caps?.refundOuts ?? 0) + booking.totalAmount > (caps?.refundCredits ?? 0)) {
          return 'source_cap' as const;
        }
        return debitWalletTx(tx, {
          guestId: booking.guestId,
          type: 'reversal',
          amountSar: booking.totalAmount,
          bookingId: booking.id,
          idempotencyKey: `refund-out:${booking.id}`,
          note: null,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'error', message: 'already_requested' };
      throw error;
    }
    if (outcome === 'insufficient_balance') {
      return { status: 'error', message: 'insufficient_balance' };
    }
    if (outcome === 'source_cap') {
      return { status: 'error', message: 'not_eligible' };
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
    return { status: 'error', message: 'server' };
  }
}
