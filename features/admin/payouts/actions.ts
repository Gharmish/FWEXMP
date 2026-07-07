'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, payouts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { splitCommission } from '@/features/bookings/lib/commission';
import { paymentCollected } from '@/features/bookings/lib/payout-sql';

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
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { success: false, message: 'forbidden' };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

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

      const amountSar = owed.reduce(
        (sum, b) => sum + splitCommission(b.totalAmount, b.commissionBps, b.vatRateBps).payoutSar,
        0,
      );
      if (amountSar !== expectedAmountSar) return 'amount_changed' as const;

      const [batch] = await tx
        .insert(payouts)
        .values({
          hostId,
          amountSar,
          bookingCount: owed.length,
          payoutIban: host.payoutIban,
          markedByUserId: admin.id,
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

      return { paidCount: owed.length } as const;
    });

    if (typeof outcome === 'string') return { success: false, message: outcome };

    revalidatePath('/[locale]/admin/payouts', 'page');
    revalidatePath('/[locale]/admin', 'page');
    return { success: true, paidCount: outcome.paidCount };
  } catch (error) {
    reportError(error, { surface: 'admin:markHostPaid', hostId });
    return { success: false, message: 'server' };
  }
}
