'use server';

import { eq, isNull, isNotNull, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

/**
 * Admin guest moderation: suspend / restore. A suspended guest keeps
 * their account and history but the booking action refuses new
 * bookings (features/bookings/actions.ts checks `suspendedAt` before
 * any insert). Same chassis as the other admin actions — admin gate,
 * conditional UPDATE against double-clicks.
 */

export interface GuestModerationState {
  success: boolean;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ ok: true } | { error: GuestModerationState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { ok: true };
}

async function setSuspension(formData: FormData, suspend: boolean): Promise<GuestModerationState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const guestId = formValue(formData, 'guestId');
  if (!guestId) return { success: false, message: 'not_found' };

  try {
    const updated = await db
      .update(guests)
      .set({ suspendedAt: suspend ? new Date() : null })
      .where(
        and(
          eq(guests.id, guestId),
          suspend ? isNull(guests.suspendedAt) : isNotNull(guests.suspendedAt),
        ),
      )
      .returning({ id: guests.id });
    if (updated.length === 0) {
      const exists = await db.query.guests.findFirst({
        where: (g) => eq(g.id, guestId),
        columns: { id: true },
      });
      return { success: false, message: exists ? 'wrong_state' : 'not_found' };
    }
  } catch (error) {
    reportError(error, { surface: 'admin:guestSuspension', guestId, suspend });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/guests/[id]', 'page');
  revalidatePath('/[locale]/admin/guests', 'page');
  return { success: true };
}

export async function suspendGuest(
  _previous: GuestModerationState,
  formData: FormData,
): Promise<GuestModerationState> {
  return setSuspension(formData, true);
}

export async function unsuspendGuest(
  _previous: GuestModerationState,
  formData: FormData,
): Promise<GuestModerationState> {
  return setSuspension(formData, false);
}
