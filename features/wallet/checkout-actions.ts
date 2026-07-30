'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, walletLedger } from '@/db/schema';
import { reportError } from '@/lib/log';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { recordPaymentEvent } from '@/features/payments/ledger';
import { MIN_CHARGE_SAR } from '@/features/promo-codes/lib/discount';
import { getSessionGuestId } from '@/features/wallet/queries';
import { releaseWalletReservation } from '@/features/wallet/reservation';
import { applyWalletCreditSchema, removeWalletCreditSchema } from '@/features/wallet/schemas';

/**
 * Guest-facing Gharmish Credit apply / remove on the payment step.
 * Mirrors the promo apply/remove contract (features/promo-codes/actions.ts):
 * the booking's charged `total_amount` shifts, so a live checkout is
 * SUPERSEDED (processing → unpaid + ledger event + client reload), and
 * settle's amount-mismatch guard backstops any stale capture.
 *
 * Credit is debited at APPLY time — the redemption ledger row commits in
 * the same transaction that reduces the total, so a balance can never be
 * promised to two bookings. `bookings.walletAppliedSar` under FOR UPDATE
 * is the idempotency arbiter (re-tap no-ops); ledger keys carry a cycle
 * suffix (`redeem:<bookingId>:<n>`) because apply→remove→re-apply is
 * legal and the key column is unique.
 *
 * Ownership is STRICT session ownership (`getSessionGuestId`), never the
 * booking cookie: a wallet belongs to an account, not to whoever holds
 * the reference.
 */

export type WalletCheckoutErrorCode =
  | 'not_found'
  | 'already_paid'
  | 'unavailable'
  | 'nothing_to_apply'
  | 'validation'
  | 'no_db'
  | 'server';

export type WalletCheckoutActionState =
  | { status: 'idle' }
  | {
      status: 'applied';
      appliedSar: number;
      totalSar: number;
      /** A live checkout was superseded — the client must tear down the stale widget. */
      checkoutSuperseded?: boolean;
    }
  | { status: 'removed'; checkoutSuperseded?: boolean }
  | { status: 'error'; error: WalletCheckoutErrorCode };

function err(error: WalletCheckoutErrorCode): WalletCheckoutActionState {
  return { status: 'error', error };
}

function revalidateWalletSurfaces(): void {
  revalidatePath('/[locale]/book/[reference]/pay', 'page');
  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
}

type Superseded = { bookingId: string; checkoutId: string; amountSar: number };

async function ledgerSupersession(s: Superseded | null, reference: string): Promise<void> {
  if (!s) return;
  try {
    await recordPaymentEvent({
      bookingId: s.bookingId,
      type: 'checkout_superseded',
      amountSar: s.amountSar,
      gatewayId: s.checkoutId,
    });
  } catch (error) {
    reportError(error, { surface: 'wallet:checkout:ledger', reference });
  }
}

export async function applyWalletCredit(
  _previous: WalletCheckoutActionState,
  formData: FormData,
): Promise<WalletCheckoutActionState> {
  if (!serverEnv.DATABASE_URL) return err('no_db');

  const parsed = applyWalletCreditSchema.safeParse({
    reference: formData.get('reference'),
    locale: formData.get('locale'),
  });
  if (!parsed.success) return err('validation');
  const input = parsed.data;

  try {
    const existing = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, input.reference),
      columns: {
        id: true,
        guestId: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
      },
    });
    if (!existing) return err('not_found');
    // Strict wallet ownership — cookie holders never spend an account's credit.
    const sessionGuestId = await getSessionGuestId();
    if (!sessionGuestId || sessionGuestId !== existing.guestId) return err('not_found');
    if (existing.paymentStatus === 'paid') return err('already_paid');
    if (existing.status !== 'confirmed') return err('unavailable');
    if (
      (existing.paymentStatus === 'unpaid' || existing.paymentStatus === 'failed') &&
      isHoldExpired(existing.paymentDeadline, new Date())
    ) {
      return err('unavailable');
    }

    let superseded: Superseded | null = null;

    const outcome = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select({
          id: bookings.id,
          guestId: bookings.guestId,
          totalAmount: bookings.totalAmount,
          walletAppliedSar: bookings.walletAppliedSar,
          paymentStatus: bookings.paymentStatus,
          status: bookings.status,
          checkoutId: bookings.checkoutId,
        })
        .from(bookings)
        .where(eq(bookings.idempotencyKey, input.reference))
        .for('update');
      if (!booking) return err('not_found');
      if (booking.paymentStatus === 'paid') return err('already_paid');
      if (booking.status !== 'confirmed') return err('unavailable');
      // Idempotent re-tap: the column is the arbiter, no second debit.
      if (booking.walletAppliedSar > 0) {
        return {
          status: 'applied',
          appliedSar: booking.walletAppliedSar,
          totalSar: booking.totalAmount,
        } as const;
      }

      // Lock order everywhere: booking row first, wallet advisory second.
      // Apply is the only transaction holding both, so no cycle exists.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'wallet:' + booking.guestId}))`);
      const [balanceRow] = await tx
        .select({ balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int` })
        .from(walletLedger)
        .where(eq(walletLedger.guestId, booking.guestId));
      const balanceSar = balanceRow?.balance ?? 0;

      // The card must still charge ≥ MIN_CHARGE_SAR — HyperPay cannot
      // charge below 1 SAR, and full-credit bookings are a later phase.
      const amount = Math.min(balanceSar, booking.totalAmount - MIN_CHARGE_SAR);
      if (amount <= 0) return err('nothing_to_apply');

      const [cycleRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(walletLedger)
        .where(and(eq(walletLedger.bookingId, booking.id), eq(walletLedger.type, 'redemption')));
      await tx.insert(walletLedger).values({
        guestId: booking.guestId,
        type: 'redemption',
        amountSar: -amount,
        bookingId: booking.id,
        idempotencyKey: `redeem:${booking.id}:${cycleRow?.n ?? 0}`,
      });

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
          totalAmount: booking.totalAmount - amount,
          walletAppliedSar: amount,
          // Clear the dead pointer with the flip: the widget was prepared
          // at the old total and can never settle this booking now, so
          // leaving it made the cron poll it forever (2026-07-28 third audit).
          ...(superseding ? { paymentStatus: 'unpaid' as const, checkoutId: null } : {}),
        })
        .where(eq(bookings.id, booking.id));

      return {
        status: 'applied',
        appliedSar: amount,
        totalSar: booking.totalAmount - amount,
        checkoutSuperseded: superseding,
      } as const;
    });

    if (outcome.status === 'applied') {
      await ledgerSupersession(superseded as Superseded | null, input.reference);
      revalidateWalletSurfaces();
    }
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'wallet:apply', reference: input.reference });
    return err('server');
  }
}

export async function removeWalletCredit(
  _previous: WalletCheckoutActionState,
  formData: FormData,
): Promise<WalletCheckoutActionState> {
  if (!serverEnv.DATABASE_URL) return err('no_db');

  const parsed = removeWalletCreditSchema.safeParse({
    reference: formData.get('reference'),
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
    const sessionGuestId = await getSessionGuestId();
    if (!sessionGuestId || sessionGuestId !== existing.guestId) return err('not_found');
    if (existing.paymentStatus === 'paid') return err('already_paid');

    const released = await releaseWalletReservation(existing.id);
    if (released.released && released.checkoutSuperseded && existing.checkoutId) {
      await ledgerSupersession(
        {
          bookingId: existing.id,
          checkoutId: existing.checkoutId,
          amountSar: released.previousTotalSar,
        },
        input.reference,
      );
    }
    revalidateWalletSurfaces();
    return {
      status: 'removed',
      checkoutSuperseded: released.released && released.checkoutSuperseded,
    };
  } catch (error) {
    reportError(error, { surface: 'wallet:remove', reference: input.reference });
    return err('server');
  }
}
