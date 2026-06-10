'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mark every still-owed (completed, unpaid) booking for one host as
 * paid out, stamping `host_paid_at = now()`. Idempotent: a second click
 * matches zero rows. The stamp itself is the payout record — no separate
 * payouts table until we need batch references / bank files.
 */
export interface MarkPaidState {
  success: boolean;
  message?: 'forbidden' | 'no_db' | 'server';
  paidCount?: number;
}

export async function markHostPaid(
  _previous: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { success: false, message: 'forbidden' };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  const parsed = z.string().regex(UUID_RE).safeParse(formData.get('hostId'));
  if (!parsed.success) {
    return { success: false, message: 'server' };
  }
  const hostId = parsed.data;

  try {
    const hostExperienceIds = db
      .select({ id: experiences.id })
      .from(experiences)
      .where(eq(experiences.hostId, hostId));

    const updated = await db
      .update(bookings)
      .set({ hostPaidAt: new Date() })
      .where(
        and(
          eq(bookings.status, 'completed'),
          isNull(bookings.hostPaidAt),
          inArray(bookings.experienceId, hostExperienceIds),
        ),
      )
      .returning({ id: bookings.id });

    revalidatePath('/[locale]/admin/payouts', 'page');
    revalidatePath('/[locale]/admin', 'page');
    return { success: true, paidCount: updated.length };
  } catch (error) {
    reportError(error, { surface: 'admin:markHostPaid', hostId });
    return { success: false, message: 'server' };
  }
}
