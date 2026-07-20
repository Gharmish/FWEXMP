import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, payoutClawbacks } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { splitCommission } from '@/features/bookings/lib/commission';

/**
 * Refund-after-payout clawbacks (2026-07-20 financial audit).
 *
 * Before this module, refunding a booking the host had already been
 * paid out for was a silent platform loss: the guest got their money
 * back, the host kept the payout, and no record existed anywhere. Now
 * every refund path calls `recordClawbackIfPaidOut` after flipping a
 * booking to `refunded` — if the booking carries `hostPaidAt`, the
 * host's payout share is written to `payout_clawbacks` and deducted
 * from that host's next "Mark paid" batch.
 *
 * Best-effort by design: a refund must never fail because the clawback
 * bookkeeping did. A failed insert alerts the team instead — an owed
 * clawback must never be silent (same discipline as `refund_due`).
 */

export interface PendingClawback {
  id: string;
  amountSar: number;
}

/**
 * Greedy plan for deducting pending clawbacks from an owed payout:
 * settle rows oldest-first while they fit inside `owedSar`, leave the
 * rest pending (rows are never partially settled — each is one
 * auditable deduction). Pure — shared by the payouts listing (display)
 * and `markHostPaid` (the actual deduction) so the amount the admin
 * saw is the amount the action deducts.
 */
export function planClawbackDeduction(
  owedSar: number,
  pending: readonly PendingClawback[],
): { netSar: number; deductedSar: number; settleIds: string[] } {
  let deductedSar = 0;
  const settleIds: string[] = [];
  for (const row of pending) {
    if (deductedSar + row.amountSar <= owedSar) {
      deductedSar += row.amountSar;
      settleIds.push(row.id);
    }
  }
  return { netSar: owedSar - deductedSar, deductedSar, settleIds };
}

/**
 * Record a clawback if this (just-refunded) booking was already paid
 * out to its host. Idempotent — the unique `booking_id` makes a replay
 * a no-op. Never throws.
 */
export async function recordClawbackIfPaidOut(bookingId: string, reason: string): Promise<void> {
  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      columns: {
        hostPaidAt: true,
        payoutId: true,
        totalAmount: true,
        commissionBps: true,
        vatRateBps: true,
        discountSar: true,
        walletAppliedSar: true,
      },
      with: { experience: { columns: { hostId: true } } },
    });
    if (!booking?.hostPaidAt || !booking.payoutId) return;

    // The share this booking contributed to its payout batch — the
    // same snapshot math that computed the batch, so the clawback
    // reverses exactly what was paid.
    const { payoutSar } = splitCommission(
      booking.totalAmount,
      booking.commissionBps,
      booking.vatRateBps,
      booking.discountSar,
      booking.walletAppliedSar,
    );
    if (payoutSar <= 0) return;

    const inserted = await db
      .insert(payoutClawbacks)
      .values({
        bookingId,
        hostId: booking.experience.hostId,
        payoutId: booking.payoutId,
        amountSar: payoutSar,
        reason,
      })
      .onConflictDoNothing()
      .returning({ id: payoutClawbacks.id });

    if (inserted.length > 0) {
      await notifyAdmin('payout_clawback', {
        bookingId,
        hostId: booking.experience.hostId,
        amountSar: payoutSar,
        reason,
      });
    }
  } catch (error) {
    // The refund already happened; the missing clawback is now the owed
    // record — page the team rather than lose it silently.
    reportError(error, { surface: 'bookings:recordClawback', bookingId });
    await notifyAdmin('payout_clawback', {
      bookingId,
      error: 'clawback record FAILED — reconcile manually',
      reason,
    });
  }
}
