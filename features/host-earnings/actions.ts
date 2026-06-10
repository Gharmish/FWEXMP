'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { hosts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { updatePayoutIbanSchema } from '@/features/host-earnings/schemas';

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
    const updated = await db
      .update(hosts)
      .set({ payoutIban: parsed.data.iban })
      .where(eq(hosts.userId, user.id))
      .returning({ id: hosts.id });
    if (updated.length === 0) return { success: false, message: 'forbidden' };
  } catch (error) {
    reportError(error, { surface: 'host-earnings:updateIban' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/earnings', 'page');
  return { success: true };
}
