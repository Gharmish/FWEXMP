import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { sourcesFor, type BookingTransitionTarget } from '@/features/bookings/lib/transitions';
import { ACTIVE_BOOKING_STATUSES, remainingCapacity } from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { executeRefund } from '@/features/bookings/lib/refund';
import { releaseWalletReservationTx } from '@/features/wallet/reservation';
import { getPlatformSettings } from '@/lib/platform-settings';
import {
  sendBookingApprovedEmail,
  sendBookingCancellationEmail,
  sendBookingDeclinedEmail,
  sendBookingExpiredEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * The ONE booking-transition executor, shared by the admin and host
 * actions. Until 2026-07 each action carried its own copy of this
 * sequence (guard → lock → capacity re-sum → deadline stamping →
 * conditional UPDATE → refund-on-cancel → decision emails) and they had
 * drifted — the host path expired lapsed approvals, the admin path
 * approved them with nothing saying whether that was intentional. The
 * actor parameter now makes every behavioral difference explicit:
 *
 *   - **Scope**: a host actor may only touch bookings on their own
 *     experiences (foreign rows answer `not_found`, never `forbidden`,
 *     so ids can't be probed); an admin actor touches any booking.
 *   - **Lapsed approval window**: a host approving past
 *     `approvalDeadline` expires the request instead (exactly what the
 *     cron would have done — the guest was promised a decision within
 *     the window). An admin approving past it SUCCEEDS: BRIEF §8 gives
 *     admin "full override powers", and an operator approving a lapsed
 *     request is a deliberate decision (e.g. the guest phoned and still
 *     wants it), not a race with the cron.
 *   - **Refund ledger attribution**: admin cancellations stamp the
 *     admin's user id on the refund events; host refunds are unattributed
 *     (the host row is implicit in the booking).
 *
 * Everything inside one transaction, like the host original: the
 * experience row is locked FOR UPDATE before the capacity re-sum, and
 * the UPDATE is conditional on the exact status just validated so a
 * concurrent transition (admin vs host racing) loses cleanly with
 * `wrong_state` instead of overwriting.
 *
 * Callers keep their own authn/authz guards, schema parsing, result
 * mapping, revalidation, and redirects — this module is the lifecycle
 * logic only. Emails are best-effort and never fail the decision.
 */

export type TransitionActor =
  | { kind: 'admin'; actorUserId: string }
  | { kind: 'host'; hostId: string };

export type TransitionResult =
  /** The booking moved to `to`; side effects (refund, email) ran. */
  | { ok: 'transitioned' }
  /** Host-only: the approval window had lapsed, so the request was
   *  expired instead (and the guest emailed). */
  | { ok: 'expired_instead' }
  | { error: 'not_found' | 'wrong_state' | 'over_capacity' | 'too_early' | 'unpaid' };

export async function executeBookingTransition(
  bookingId: string,
  to: BookingTransitionTarget,
  actor: TransitionActor,
): Promise<TransitionResult> {
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
        walletAppliedSar: true,
        paymentReference: true,
        paymentDeadline: true,
        approvalDeadline: true,
        idempotencyKey: true,
      },
      with: {
        experience: { columns: { hostId: true, maxGroupSize: true } },
        guest: { columns: { preferredLanguage: true } },
      },
    });
    // Foreign and missing bookings are indistinguishable on purpose.
    if (!booking || (actor.kind === 'host' && booking.experience.hostId !== actor.hostId)) {
      return 'not_found' as const;
    }
    if (!sourcesFor(to).includes(booking.status)) return 'wrong_state' as const;

    // Completing has FINANCIAL side effects — it makes the booking
    // payout-eligible and (being terminal) strips the guest's
    // cancellation rights. Two gates (2026-07-20 audit — previously a
    // host could complete a paid booking the moment it was confirmed,
    // locking in the money before the experience ever ran, or complete
    // an uncollected booking into a payout obligation):
    //   1. the experience date must have arrived (Riyadh calendar —
    //      same-day completion is fine, the cron's own auto-complete
    //      only fires the day AFTER);
    //   2. the money must actually be collected: paid online, or a
    //      genuinely payment-off deployment (no gateway configured).
    if (to === 'completed') {
      const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
        new Date(),
      );
      if (booking.date > todayRiyadh) return 'too_early' as const;
      const collected =
        booking.paymentStatus === 'paid' || (!hasHyperpay() && booking.paymentDeadline === null);
      if (!collected) return 'unpaid' as const;
    }

    // Approving a request (pending → confirmed) carries side effects:
    // stamp the approval and, when online payment is on, open the
    // guest's payment window (pay-after-approval — the request itself
    // was never charged). The release-holds cron frees the spot if the
    // guest never pays.
    const isApproval = to === 'confirmed' && booking.status === 'pending';

    // Lapsed approval window — actor-dependent, see the header.
    if (
      actor.kind === 'host' &&
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
    if (to === 'declined' && booking.status === 'pending') {
      stamp = { status: to, declinedAt: new Date() };
    }
    if (to === 'cancelled') {
      stamp = { status: to, cancelledAt: new Date(), cancellationKind: 'operator' };
    }
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
    // transition between read and write loses cleanly.
    const updated = await tx
      .update(bookings)
      .set(stamp)
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
      .returning({ id: bookings.id });
    if (updated.length === 0) return 'wrong_state' as const;

    // Cancelling an UNPAID booking with checkout-applied credit only
    // kills a reservation — return it atomically with the status flip
    // (PAID credit travels through the refund executor below instead).
    if (to === 'cancelled' && booking.paymentStatus !== 'paid' && booking.walletAppliedSar > 0) {
      await releaseWalletReservationTx(tx, bookingId);
    }
    return {
      decided: to,
      reference: booking.idempotencyKey,
      isApproval,
      wasPaid: booking.paymentStatus === 'paid',
      // Full paid base: card charge + any redeemed Gharmish Credit —
      // the refund executor splits it back across the two rails.
      paidBaseSar: booking.totalAmount + booking.walletAppliedSar,
      paymentReference: booking.paymentReference,
      guestLocale: booking.guest.preferredLanguage,
    } as const;
  });
  if (typeof outcome === 'string') return { error: outcome };

  // The approval window had already lapsed (host actor): the request was
  // expired, not approved. Tell the guest; the caller surfaces
  // "already moved on" to the host.
  if ('lapsed' in outcome) {
    try {
      await sendBookingExpiredEmail(outcome.reference);
    } catch (error) {
      reportError(error, { surface: 'booking-transition:expiredEmail', bookingId });
    }
    return { ok: 'expired_instead' };
  }

  // Cancelling a booking the guest already paid for must give the money
  // back: gateway-first refund with the manual fallback (same executor
  // as guest self-cancellation). The guest is never at fault for an
  // operator cancellation, so the refund is always in full.
  let refund: 'none' | 'refunded' | 'refund_pending' = 'none';
  if (outcome.decided === 'cancelled' && outcome.wasPaid) {
    refund = await executeRefund(
      bookingId,
      outcome.paymentReference,
      outcome.paidBaseSar,
      actor.kind === 'admin' ? actor.actorUserId : undefined,
    );
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
    reportError(error, { surface: 'booking-transition:decisionEmail', bookingId, to });
  }
  return { ok: 'transitioned' };
}
