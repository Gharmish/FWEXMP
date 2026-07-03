'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { hosts, payoutIbanEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { updatePayoutIbanSchema } from '@/features/host-earnings/schemas';
import { maskIban } from '@/features/host-earnings/lib/iban';

/**
 * Payout-method management. The IBAN is the only field a host edits
 * here — bank transfers themselves stay a manual admin step (the
 * payouts page), so a typo'd IBAN can never silently re-route money:
 * the admin sees the value at transfer time.
 *
 * Scope: resolved from the session (`hosts.userId`), never a form id.
 */

export type UpdatePayoutIbanState =
  | { success: true }
  | { success: false; message?: 'forbidden' | 'no_db' | 'validation' | 'server' };

export async function updatePayoutIban(
  _previous: UpdatePayoutIbanState,
  formData: FormData,
): Promise<UpdatePayoutIbanState> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: 'forbidden' };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  const raw = formData.get('iban');
  const locale = formData.get('locale');
  const parsed = updatePayoutIbanSchema.safeParse({
    iban: typeof raw === 'string' ? raw : '',
    locale: typeof locale === 'string' ? locale : '',
  });
  if (!parsed.success) return { success: false, message: 'validation' };

  try {
    // Update + audit in one transaction so the trail can't drift from
    // the write. The log stores masked values only — never a full IBAN.
    const outcome = await db.transaction(async (tx) => {
      const host = await tx.query.hosts.findFirst({
        where: (h) => eq(h.userId, user.id),
        columns: { id: true, payoutIban: true },
      });
      if (!host) return 'forbidden' as const;
      await tx.update(hosts).set({ payoutIban: parsed.data.iban }).where(eq(hosts.id, host.id));
      // No-op saves (same IBAN resubmitted) don't pollute the trail.
      if (host.payoutIban !== parsed.data.iban) {
        await tx.insert(payoutIbanEvents).values({
          hostId: host.id,
          actorUserId: user.id,
          previousIbanMasked: maskIban(host.payoutIban),
          newIbanMasked: maskIban(parsed.data.iban) ?? '',
        });
      }
      return 'ok' as const;
    });
    if (outcome === 'forbidden') return { success: false, message: 'forbidden' };
  } catch (error) {
    reportError(error, { surface: 'host-earnings:updateIban' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/earnings', 'page');
  return { success: true };
}
