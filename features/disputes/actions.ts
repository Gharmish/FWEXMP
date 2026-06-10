'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, disputes } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { createDisputeSchema, resolveDisputeSchema } from '@/features/disputes/schemas';

/**
 * Disputes ("report a problem"). Guest side files against a booking
 * they can prove they hold (owner session or last-booking cookie —
 * the same authorization the booking page itself uses); admin side
 * resolves with internal notes. One OPEN dispute per booking: a guest
 * with a follow-up adds it after the team resolves the first, instead
 * of forking parallel threads.
 */

export type CreateDisputeState =
  | { success: true }
  | {
      success: false;
      message?: 'no_db' | 'not_found' | 'already_open' | 'validation' | 'server';
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createDispute(
  _previous: CreateDisputeState,
  formData: FormData,
): Promise<CreateDisputeState> {
  const parsed = createDisputeSchema.safeParse({
    reference: formValue(formData, 'reference'),
    message: formValue(formData, 'message'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { reference, message } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, guestId: true },
    });
    if (!booking) return { success: false, message: 'not_found' };
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Indistinguishable from missing — references can't be probed.
      return { success: false, message: 'not_found' };
    }

    const open = await db.query.disputes.findFirst({
      where: and(eq(disputes.bookingId, booking.id), eq(disputes.status, 'open')),
      columns: { id: true },
    });
    if (open) return { success: false, message: 'already_open' };

    await db.insert(disputes).values({
      bookingId: booking.id,
      guestId: booking.guestId,
      message,
    });
  } catch (error) {
    reportError(error, { surface: 'disputes:create', reference });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/disputes', 'page');
  return { success: true };
}

export type ResolveDisputeState =
  | { success: true }
  | { success: false; message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'server' };

export async function resolveDispute(
  _previous: ResolveDisputeState,
  formData: FormData,
): Promise<ResolveDisputeState> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { success: false, message: 'forbidden' };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  const parsed = resolveDisputeSchema.safeParse({
    disputeId: formValue(formData, 'disputeId'),
    adminNotes: formValue(formData, 'adminNotes') || undefined,
  });
  if (!parsed.success) return { success: false, message: 'not_found' };
  const { disputeId, adminNotes } = parsed.data;

  try {
    const updated = await db
      .update(disputes)
      .set({
        status: 'resolved',
        adminNotes: adminNotes ?? null,
        resolvedByUserId: admin.id,
        resolvedAt: new Date(),
      })
      .where(and(eq(disputes.id, disputeId), eq(disputes.status, 'open')))
      .returning({ id: disputes.id });
    if (updated.length === 0) {
      const exists = await db.query.disputes.findFirst({
        where: eq(disputes.id, disputeId),
        columns: { id: true },
      });
      return { success: false, message: exists ? 'wrong_state' : 'not_found' };
    }
  } catch (error) {
    reportError(error, { surface: 'disputes:resolve', disputeId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/disputes', 'page');
  return { success: true };
}
