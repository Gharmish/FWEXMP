'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { hostTransitionBookingSchema } from '@/features/host-bookings/schemas';
import { executeBookingTransition } from '@/features/bookings/lib/transition-executor';

/**
 * Host booking actions — the self-service half of the booking
 * lifecycle (admin keeps override powers via its own actions).
 *
 * Authorization is two-layered, both inside the transaction:
 *   1. the caller's `hosts` row is resolved from the session
 *      (`hosts.userId = user.id`) — never from the form;
 *   2. the booking's experience must belong to that host. Foreign
 *      bookings answer `not_found`, not `forbidden`, so booking ids
 *      can't be probed for existence.
 *
 * Accepting a request re-checks capacity exactly like the admin
 * confirm: lock the experience row, re-sum active party sizes on the
 * date (excluding this booking), refuse if it would overflow
 * `maxGroupSize`. Suspended hosts can look but not act.
 */

export interface HostBookingActionResult {
  success: false;
  message?:
    | 'forbidden'
    | 'suspended'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'over_capacity'
    | 'too_early'
    | 'unpaid'
    | 'validation'
    | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireActiveHost(): Promise<
  { hostId: string } | { error: HostBookingActionResult }
> {
  const user = await getCurrentUser();
  if (!user) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true, verificationStatus: true },
    });
    if (!host) return { error: { success: false, message: 'forbidden' } };
    if (host.verificationStatus === 'suspended') {
      return { error: { success: false, message: 'suspended' } };
    }
    return { hostId: host.id };
  } catch (error) {
    reportError(error, { surface: 'host-bookings:requireActiveHost' });
    return { error: { success: false, message: 'server' } };
  }
}

export async function transitionBookingAsHost(
  _previous: HostBookingActionResult,
  formData: FormData,
): Promise<HostBookingActionResult> {
  const guard = await requireActiveHost();
  if ('error' in guard) return guard.error;
  const { hostId } = guard;

  const parsed = hostTransitionBookingSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    to: formValue(formData, 'to'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { bookingId, to, locale } = parsed.data;

  try {
    // Shared lifecycle executor (features/bookings/lib/transition-executor):
    // ownership scope, lock → capacity re-sum → approval stamping →
    // conditional UPDATE → refund-on-cancel → decision emails. The host
    // actor may only touch bookings on their own experiences, and a
    // lapsed approval window expires the request instead of approving it.
    const result = await executeBookingTransition(bookingId, to, { kind: 'host', hostId });
    if ('error' in result) return { success: false, message: result.error };

    // The approval window had already lapsed: the request was expired
    // (not approved, guest emailed). Surface "already moved on" to the host.
    if (result.ok === 'expired_instead') {
      revalidatePath('/[locale]/host/bookings', 'page');
      return { success: false, message: 'wrong_state' };
    }
  } catch (error) {
    reportError(error, { surface: 'host-bookings:transition', bookingId, to });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/bookings', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  redirect({ href: '/host/bookings', locale });
}
