'use server';

import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, disputes } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
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
      message?: 'no_db' | 'not_found' | 'already_open' | 'throttled' | 'validation' | 'server';
    };

/**
 * Dispute-spam throttle (same posture as the review throttle, 2026-07
 * audit M1). One OPEN dispute per booking is the hard gate, but a guest
 * holding several bookings — or ping-ponging resolve→refile on one —
 * could still flood the queue and the alert inbox. Generous enough
 * that no honest guest ever sees it.
 */
const MAX_DISPUTES_PER_GUEST_PER_HOUR = 5;
const DISPUTE_THROTTLE_WINDOW_MS = 60 * 60 * 1000;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * postgres.js surfaces unique violations as code 23505 with the
 * constraint name; matched by name (like the booking idempotency
 * catch) so an unrelated collision still reports as 'server'.
 */
function isOpenDisputeCollision(error: unknown): boolean {
  const pg = error as { code?: unknown; constraint_name?: unknown };
  return pg?.code === '23505' && pg?.constraint_name === 'disputes_one_open_per_booking';
}

export async function createDispute(
  _previous: CreateDisputeState,
  formData: FormData,
): Promise<CreateDisputeState> {
  const parsed = createDisputeSchema.safeParse({
    reference: formValue(formData, 'reference'),
    message: formValue(formData, 'message'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { reference, message } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  let referenceCode: string;
  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, guestId: true, referenceCode: true },
    });
    if (!booking) return { success: false, message: 'not_found' };
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Indistinguishable from missing — references can't be probed.
      return { success: false, message: 'not_found' };
    }
    referenceCode = booking.referenceCode;

    const open = await db.query.disputes.findFirst({
      where: and(eq(disputes.bookingId, booking.id), eq(disputes.status, 'open')),
      columns: { id: true },
    });
    if (open) return { success: false, message: 'already_open' };

    const [{ recentByGuest }] = await db
      .select({ recentByGuest: sql<number>`count(*)::int` })
      .from(disputes)
      .where(
        and(
          eq(disputes.guestId, booking.guestId),
          gte(disputes.createdAt, new Date(Date.now() - DISPUTE_THROTTLE_WINDOW_MS)),
        ),
      );
    if (recentByGuest >= MAX_DISPUTES_PER_GUEST_PER_HOUR) {
      return { success: false, message: 'throttled' };
    }

    await db.insert(disputes).values({
      bookingId: booking.id,
      guestId: booking.guestId,
      message,
    });
  } catch (error) {
    // The partial unique index closes the pre-check's race window: the
    // loser of two concurrent submits lands here, not on a second row.
    if (isOpenDisputeCollision(error)) return { success: false, message: 'already_open' };
    reportError(error, { surface: 'disputes:create', reference });
    return { success: false, message: 'server' };
  }

  // "A real person in Abha will reply" only works if a real person
  // hears about it — alert the team inbox. Best-effort, never blocks.
  // The GH- code, not the UUID capability: it's what /admin/bookings
  // and every guest-facing surface call the booking.
  await notifyAdmin('dispute_opened', { reference: referenceCode });

  revalidatePath('/[locale]/admin/disputes', 'page');
  return { success: true };
}

export type ResolveDisputeState =
  | { success: true }
  | {
      success: false;
      message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'validation' | 'server';
    };

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
  if (!parsed.success) {
    // Over-long notes are the admin's fixable mistake — say so instead
    // of the misleading not_found a tampered/missing id gets.
    const notesTooLong = parsed.error.issues.some((issue) => issue.path[0] === 'adminNotes');
    return { success: false, message: notesTooLong ? 'validation' : 'not_found' };
  }
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
