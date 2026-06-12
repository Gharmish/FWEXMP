'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { hostTransitionBookingSchema } from '@/features/host-bookings/schemas';
import { sourcesFor } from '@/features/bookings/lib/transitions';
import { ACTIVE_BOOKING_STATUSES, remainingCapacity } from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { executeRefund } from '@/features/bookings/lib/refund';
import { getPlatformSettings } from '@/features/admin/settings/queries';
import {
  sendBookingApprovedEmail,
  sendBookingCancellationEmail,
  sendBookingDeclinedEmail,
  sendBookingExpiredEmail,
} from '@/features/bookings/lib/booking-email';

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
    const outcome = await db.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: (b) => eq(b.id, bookingId),
        columns: {
          id: true,
          experienceId: true,
          date: true,
          partySize: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          paymentReference: true,
          approvalDeadline: true,
          idempotencyKey: true,
        },
        with: {
          experience: { columns: { hostId: true, maxGroupSize: true } },
          guest: { columns: { preferredLanguage: true } },
        },
      });
      // Foreign and missing bookings are indistinguishable on purpose.
      if (!booking || booking.experience.hostId !== hostId) return 'not_found' as const;
      if (!sourcesFor(to).includes(booking.status)) return 'wrong_state' as const;

      // Approving a request (pending → confirmed) carries side effects:
      // stamp the approval and, when online payment is on, open the
      // guest's payment window (pay-after-approval — the request itself
      // was never charged). The release-holds cron frees the spot if the
      // guest never pays.
      const isApproval = to === 'confirmed' && booking.status === 'pending';

      // A request whose approval window has lapsed can no longer be
      // approved — the guest was promised a decision within the window
      // and the cron may simply not have run yet. Flip it to `expired`
      // here (exactly what the cron would do) instead of approving.
      if (
        isApproval &&
        booking.approvalDeadline !== null &&
        booking.approvalDeadline.getTime() <= Date.now()
      ) {
        await tx
          .update(bookings)
          .set({ status: 'expired' })
          .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'pending')));
        return { lapsed: true, reference: booking.idempotencyKey } as const;
      }

      let stamp: Partial<typeof bookings.$inferInsert> = { status: to };
      if (isApproval) {
        const needsPayment = hasHyperpay() && booking.paymentStatus === 'unpaid';
        const { approvalPaymentWindowHours } = await getPlatformSettings();
        stamp = {
          status: to,
          approvedAt: new Date(),
          paymentDeadline: needsPayment
            ? new Date(Date.now() + approvalPaymentWindowHours * 3_600_000)
            : null,
        };
      }

      if (to === 'confirmed') {
        // Serialize against concurrent confirms and instant bookings
        // for this experience, then re-sum the date excluding this row.
        await tx.execute(
          sql`select 1 from ${experiences} where ${experiences.id} = ${booking.experienceId} for update`,
        );
        const [{ booked }] = await tx
          .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.experienceId, booking.experienceId),
              eq(bookings.date, booking.date),
              inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
              holdStillCounts(),
              ne(bookings.id, bookingId),
            ),
          );
        if (remainingCapacity(booking.experience.maxGroupSize, booked) < booking.partySize) {
          return 'over_capacity' as const;
        }
      }

      // Conditional on the status we just validated, so a concurrent
      // admin transition between read and write can't be overwritten.
      const updated = await tx
        .update(bookings)
        .set(stamp)
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
        .returning({ id: bookings.id });
      if (updated.length === 0) return 'wrong_state' as const;
      return {
        decided: to,
        reference: booking.idempotencyKey,
        isApproval,
        wasPaid: booking.paymentStatus === 'paid',
        totalAmount: booking.totalAmount,
        paymentReference: booking.paymentReference,
        guestLocale: booking.guest.preferredLanguage,
      } as const;
    });
    if (typeof outcome === 'string') return { success: false, message: outcome };

    // The approval window had already lapsed: the request was expired
    // (not approved). Tell the guest, surface "already moved on" to the host.
    if ('lapsed' in outcome) {
      try {
        await sendBookingExpiredEmail(outcome.reference);
      } catch (error) {
        reportError(error, { surface: 'host-bookings:expiredEmail', bookingId });
      }
      revalidatePath('/[locale]/host/bookings', 'page');
      return { success: false, message: 'wrong_state' };
    }

    // Cancelling a booking the guest already paid for must give the
    // money back: gateway-first refund with the manual fallback (same
    // executor as guest self-cancellation). The guest is never at fault
    // for a host cancellation, so the refund is always in full.
    let refund: 'none' | 'refunded' | 'refund_pending' = 'none';
    if (outcome.decided === 'cancelled' && outcome.wasPaid) {
      refund = await executeRefund(bookingId, outcome.paymentReference, outcome.totalAmount);
    }

    // Tell the guest — best-effort, never fails the decision.
    try {
      if (outcome.isApproval) {
        await sendBookingApprovedEmail(outcome.reference);
      } else if (outcome.decided === 'declined') {
        await sendBookingDeclinedEmail(outcome.reference);
      } else if (outcome.decided === 'cancelled') {
        await sendBookingCancellationEmail(outcome.reference, outcome.guestLocale, refund, {
          cancelledBy: 'operator',
        });
      }
    } catch (error) {
      reportError(error, { surface: 'host-bookings:decisionEmail', bookingId, to });
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
