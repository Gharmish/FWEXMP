'use server';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bookings, experiences, payoutClawbacks, payouts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminFailureMessage, adminGateRefused, requireAdminActor } from '@/features/admin/guard';
import { splitCommission } from '@/features/bookings/lib/commission';
import { paymentCollected } from '@/features/bookings/lib/payout-sql';
import { planClawbackDeduction } from '@/features/bookings/lib/clawback';
import { sendHostPayoutPaidEmail } from '@/features/admin/payouts/payout-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mark every still-owed booking for one host as paid out, as a recorded
 * payout batch:
 *
 *   - eligibility: `completed`, not yet paid out, and the money was
 *     actually COLLECTED (paid online, or no online payment required) —
 *     hosts are never paid from money the platform doesn't hold;
 *   - destination: refused outright when the host has no IBAN on file
 *     or is suspended;
 *   - what-you-see-is-what-you-pay: the page posts the owed amount it
 *     displayed; if the owed set changed since render (a booking
 *     completed, a refund landed), the action refuses with
 *     `amount_changed` instead of silently marking a different total;
 *   - audit: a `payouts` row records amount, booking count, the IBAN
 *     snapshot, and the marking admin; each booking links back via
 *     `payout_id`. Amounts come from the per-booking commission
 *     snapshot, so they can never restate later.
 */
export interface MarkPaidState {
  success: boolean;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'no_iban'
    | 'suspended'
    | 'amount_changed'
    | 'nothing_owed'
    | 'server';
  paidCount?: number;
}

const markPaidSchema = z.object({
  hostId: z.string().regex(UUID_RE),
  /** The owed total the admin saw when they clicked, whole SAR. */
  expectedAmountSar: z.coerce.number().int().min(0),
});

export async function markHostPaid(
  _previous: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) return { success: false, message: adminFailureMessage(actor) };

  const parsed = markPaidSchema.safeParse({
    hostId: formData.get('hostId'),
    expectedAmountSar: formData.get('expectedAmountSar'),
  });
  if (!parsed.success) {
    return { success: false, message: 'server' };
  }
  const { hostId, expectedAmountSar } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      const host = await tx.query.hosts.findFirst({
        where: (h) => eq(h.id, hostId),
        columns: { id: true, payoutIban: true, verificationStatus: true },
      });
      if (!host) return 'server' as const;
      if (host.verificationStatus === 'suspended') return 'suspended' as const;
      if (!host.payoutIban) return 'no_iban' as const;

      const hostExperienceIds = tx
        .select({ id: experiences.id })
        .from(experiences)
        .where(eq(experiences.hostId, hostId));

      // Lock the owed rows so a concurrent mark / refund can't slip in
      // between the amount check and the stamp.
      const owed = await tx
        .select({
          id: bookings.id,
          totalAmount: bookings.totalAmount,
          commissionBps: bookings.commissionBps,
          vatRateBps: bookings.vatRateBps,
          discountSar: bookings.discountSar,
          walletAppliedSar: bookings.walletAppliedSar,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.status, 'completed'),
            isNull(bookings.hostPaidAt),
            paymentCollected(),
            inArray(bookings.experienceId, hostExperienceIds),
          ),
        )
        .for('update');

      if (owed.length === 0) return 'nothing_owed' as const;

      const grossSar = owed.reduce(
        (sum, b) =>
          sum +
          splitCommission(
            b.totalAmount,
            b.commissionBps,
            b.vatRateBps,
            b.discountSar,
            b.walletAppliedSar,
          ).payoutSar,
        0,
      );

      // Deduct pending clawbacks (refunds issued after an earlier
      // payout) — locked and planned greedy oldest-first, the same rule
      // the payouts page used to display the net. The batch records the
      // NET actually transferred; each settled clawback row is stamped
      // with this batch so the deduction is auditable.
      const pendingClawbacks = await tx
        .select({ id: payoutClawbacks.id, amountSar: payoutClawbacks.amountSar })
        .from(payoutClawbacks)
        .where(and(eq(payoutClawbacks.hostId, hostId), isNull(payoutClawbacks.settledPayoutId)))
        .orderBy(asc(payoutClawbacks.createdAt))
        .for('update');
      const plan = planClawbackDeduction(grossSar, pendingClawbacks);
      if (plan.netSar !== expectedAmountSar) return 'amount_changed' as const;

      const [batch] = await tx
        .insert(payouts)
        .values({
          hostId,
          amountSar: plan.netSar,
          bookingCount: owed.length,
          payoutIban: host.payoutIban,
          markedByUserId: actor.adminUserId,
        })
        .returning({ id: payouts.id });

      await tx
        .update(bookings)
        .set({ hostPaidAt: new Date(), payoutId: batch.id })
        .where(
          inArray(
            bookings.id,
            owed.map((b) => b.id),
          ),
        );

      if (plan.settleIds.length > 0) {
        await tx
          .update(payoutClawbacks)
          .set({ settledPayoutId: batch.id, settledAt: new Date() })
          .where(inArray(payoutClawbacks.id, plan.settleIds));
      }

      return {
        paidCount: owed.length,
        payoutId: batch.id,
        netSar: plan.netSar,
        ibanLast4: host.payoutIban ? host.payoutIban.slice(-4) : null,
      } as const;
    });

    if (typeof outcome === 'string') return { success: false, message: outcome };

    // Tell the host their transfer is on its way — deduped on the batch
    // id, best-effort, never fails the mark-paid.
    try {
      await sendHostPayoutPaidEmail({
        hostId,
        payoutId: outcome.payoutId,
        amountSar: outcome.netSar,
        bookingCount: outcome.paidCount,
        ibanLast4: outcome.ibanLast4,
      });
    } catch (error) {
      reportError(error, { surface: 'admin:markHostPaid:email', hostId });
    }

    revalidatePath('/[locale]/admin/payouts', 'page');
    revalidatePath('/[locale]/admin', 'page');
    return { success: true, paidCount: outcome.paidCount };
  } catch (error) {
    reportError(error, { surface: 'admin:markHostPaid', hostId });
    return { success: false, message: 'server' };
  }
}
