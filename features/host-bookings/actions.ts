'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { bookings } from '@/db/schema';
import { getCurrentHostRef } from '@/features/host-dashboard/queries';
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
 *
 * Success is a redirect back to where the host acted (`returnTo`),
 * carrying `done=<outcome>&ref=<code>` (and `until=` for an approval
 * that opened a payment window) so the page can confirm what happened
 * and what comes next — the row itself moves buckets silently.
 */

export type HostBookingActionError =
  | 'forbidden'
  | 'suspended'
  | 'no_db'
  | 'not_found'
  | 'wrong_state'
  | 'over_capacity'
  | 'too_early'
  | 'too_late'
  | 'unpaid'
  | 'reason_required'
  | 'validation'
  | 'server';

export interface HostBookingActionResult {
  success: false;
  message?: HostBookingActionError;
}

/** What `?done=` can say after a redirect. */
export type HostBookingOutcome = 'approved' | 'declined' | 'cancelled' | 'completed' | 'expired';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireActiveHost(): Promise<
  { hostId: string } | { error: HostBookingActionResult }
> {
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  try {
    const host = await getCurrentHostRef();
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

function withOutcome(
  returnTo: string | undefined,
  outcome: HostBookingOutcome,
  referenceCode: string,
  until: string | null,
): string {
  const base = returnTo ?? '/host/bookings';
  const [path, query = ''] = base.split('?');
  const search = new URLSearchParams(query);
  search.set('done', outcome);
  search.set('ref', referenceCode);
  if (until) search.set('until', until);
  else search.delete('until');
  return `${path}?${search.toString()}`;
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
    returnTo: formValue(formData, 'returnTo') || undefined,
    reason: formValue(formData, 'reason') || undefined,
    reasonText: formValue(formData, 'reasonText'),
  });
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((issue) => issue.path[0] === 'reason');
    return { success: false, message: reasonMissing ? 'reason_required' : 'validation' };
  }
  const { bookingId, to, locale, returnTo, reason, reasonText } = parsed.data;

  let outcome: HostBookingOutcome;
  let referenceCode = '';
  let until: string | null = null;
  try {
    // Shared lifecycle executor (features/bookings/lib/transition-executor):
    // ownership scope, lock → capacity re-sum → approval stamping →
    // conditional UPDATE → refund-on-cancel → decision emails. The host
    // actor may only touch bookings on their own experiences, and a
    // lapsed approval window expires the request instead of approving it.
    const result = await executeBookingTransition(bookingId, to, {
      kind: 'host',
      hostId,
      reason: to === 'cancelled' ? [reason, reasonText].filter(Boolean).join(': ') : undefined,
    });
    if ('error' in result) return { success: false, message: result.error };

    // Re-read the two facts the confirmation line needs: the human
    // reference and (for an approval) when the guest's payment hold
    // lapses. Cheap, and keeps the executor's result shape untouched.
    const row = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      columns: { referenceCode: true, paymentDeadline: true, paymentStatus: true },
    });
    referenceCode = row?.referenceCode ?? '';

    if (result.ok === 'expired_instead') {
      outcome = 'expired';
    } else if (to === 'confirmed') {
      outcome = 'approved';
      until =
        row && row.paymentStatus !== 'paid' && row.paymentDeadline
          ? row.paymentDeadline.toISOString()
          : null;
    } else if (to === 'declined') {
      outcome = 'declined';
    } else if (to === 'cancelled') {
      outcome = 'cancelled';
    } else {
      outcome = 'completed';
    }
  } catch (error) {
    reportError(error, { surface: 'host-bookings:transition', bookingId, to });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/bookings', 'page');
  revalidatePath('/[locale]/host/bookings/[ref]', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  redirect({ href: withOutcome(returnTo, outcome, referenceCode, until), locale });
}
