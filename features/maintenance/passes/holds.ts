import 'server-only';

import { and, eq, inArray, isNull, isNotNull, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, paymentEvents, walletLedger } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import {
  sendBookingExpiredEmail,
  sendBookingPaymentLapsedEmail,
  sendHostHoldLapsedEmail,
} from '@/features/bookings/lib/booking-email';
import { releaseWalletReservation } from '@/features/wallet/reservation';
import type { PassRunner } from '@/features/maintenance/runner';

/**
 * Capacity holds: expire undecided requests, release lapsed unpaid holds,
 * and the three crash-recovery sweeps that keep wallet credit and refund
 * queues consistent with terminal bookings.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function expireRequests(run: PassRunner) {
  // Pass 0 — expire undecided booking requests. A `pending` request the
  // host neither approved nor declined within the approval window moves
  // to `expired` (terminal, frees the soft-held capacity; nothing was
  // ever charged in the pay-after-approval model). The guest is told —
  // best-effort, gated on having an email on file.
  const expired = await run.pass(
    '0-expire-requests',
    async () => {
      const rows = await db
        .update(bookings)
        .set({ status: 'expired' })
        .where(
          and(
            eq(bookings.status, 'pending'),
            isNotNull(bookings.approvalDeadline),
            lte(bookings.approvalDeadline, new Date()),
          ),
        )
        .returning({ id: bookings.id, reference: bookings.idempotencyKey });
      for (const row of rows) {
        try {
          await sendBookingExpiredEmail(row.reference);
        } catch (error) {
          reportError(error, { surface: 'cron-expire-requests', reference: row.reference });
        }
      }
      return rows;
    },
    [] as Array<{ id: string; reference: string }>,
  );
  return expired;
}

export async function releaseHolds(run: PassRunner) {
  // `failed` joins `unpaid` here: a final failed attempt holds no
  // payment in flight (unlike `processing`), so past the deadline the
  // booking is released the same way. `createCheckout` refuses both
  // once the hold has lapsed, so a released seat can never be charged.
  const released = await run.pass(
    '1-release-holds',
    async () => {
      const rows = await db
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancellationKind: 'system' })
        .where(
          and(
            inArray(bookings.paymentStatus, ['unpaid', 'failed']),
            // NEVER release a booking that is under review (2026-07-28
            // eighth audit). `createCheckout` refuses while
            // `settleAnomalyAt` is set, so the guest CANNOT pay — and
            // without this exclusion the hold simply lapsed here, the
            // booking was cancelled as `system`, and a real capture was
            // left orphaned on a cancelled row that Pass 1c's watch can't
            // see either (it requires paymentStatus='paid'). The guard
            // must freeze the clock, not just the button.
            isNull(bookings.settleAnomalyAt),
            isNotNull(bookings.paymentDeadline),
            lte(bookings.paymentDeadline, new Date()),
            notInArray(bookings.status, [
              'cancelled',
              'completed',
              'refunded',
              'declined',
              'expired',
            ]),
          ),
        )
        .returning({
          id: bookings.id,
          reference: bookings.idempotencyKey,
          walletAppliedSar: bookings.walletAppliedSar,
        });
      // An approved-then-never-paid request (or an abandoned instant hold)
      // was just released — tell the guest the hold lapsed, and the host
      // that the booking they were notified about evaporated. Best-effort.
      for (const row of rows) {
        // A lapsed hold with checkout-applied credit was only a
        // reservation — return it before the emails (never silently
        // strand a guest's credit on a booking they can no longer pay).
        if (row.walletAppliedSar > 0) {
          try {
            await releaseWalletReservation(row.id);
          } catch (error) {
            reportError(error, {
              surface: 'cron-release-holds:wallet',
              reference: row.reference,
            });
          }
        }
        try {
          await sendBookingPaymentLapsedEmail(row.reference);
        } catch (error) {
          reportError(error, { surface: 'cron-release-holds:email', reference: row.reference });
        }
        try {
          await sendHostHoldLapsedEmail(row.reference);
        } catch (error) {
          reportError(error, {
            surface: 'cron-release-holds:hostEmail',
            reference: row.reference,
          });
        }
      }
      return rows;
    },
    [] as Array<{ id: string; reference: string; walletAppliedSar: number }>,
  );
  return released;
}

export async function sweepStrandedReservations(run: PassRunner) {
  // Pass 1b — stranded-reservation sweep (2026-07-28 audit). Any path
  // that flips a booking terminal can in principle die between the
  // flip and its wallet release (the fast-path release above included,
  // in older deploys where it ran outside the transaction). A terminal
  // UNPAID booking still carrying `walletAppliedSar > 0` is exactly
  // that stranded state — the guest's credit debited for a booking
  // that no longer exists. `releaseWalletReservation` re-checks under
  // FOR UPDATE, so re-running here is idempotent and race-free.
  await run.pass(
    '1b-stranded-reservations',
    async () => {
      const stranded = await db.query.bookings.findMany({
        where: and(
          inArray(bookings.status, ['cancelled', 'expired', 'declined']),
          notInArray(bookings.paymentStatus, ['paid']),
          sql`${bookings.walletAppliedSar} > 0`,
        ),
        columns: { id: true, idempotencyKey: true },
      });
      for (const row of stranded) {
        try {
          const release = await releaseWalletReservation(row.id);
          if (release.released) {
            reportError(new Error('stranded wallet reservation released by sweep'), {
              surface: 'cron-release-holds:strandedSweep',
              reference: row.idempotencyKey,
              amountSar: release.amountSar,
            });
          }
        } catch (error) {
          reportError(error, {
            surface: 'cron-release-holds:strandedSweep',
            reference: row.idempotencyKey,
          });
        }
      }
    },
    undefined,
  );
}

export async function watchOrphanedRefunds(run: PassRunner) {
  // Pass 1c — orphaned-refund watch (2026-07-28 audit). A cancellation
  // that owed the guest money commits its flip first and refunds
  // second; a crash in between leaves `cancelled + paid` with an
  // INCOMPLETE refund journal and no queue entry. The predicate is
  // arithmetic, not null-checks (2026-08-01 ninth audit): a crashed
  // PARTIAL-tier cancel stamps `forfeitedSar` inside the flip
  // transaction, so the old `isNull(forfeitedSar)` filter read the row
  // as a legitimate full forfeit and the guest's owed 50% was never
  // seen. A row is healthy only when what went back plus what was
  // deliberately retained covers the full paid base. The policy amount
  // is contextual, so this pass only ALERTS (hourly, until an admin
  // settles it via the manual refund action) rather than moving money.
  await run.pass(
    '1c-orphaned-refunds',
    async () => {
      const orphanedRefunds = await db.query.bookings.findMany({
        where: and(
          eq(bookings.status, 'cancelled'),
          eq(bookings.paymentStatus, 'paid'),
          isNull(bookings.refundDueSar),
          sql`coalesce(${bookings.refundedAmountSar}, 0) + coalesce(${bookings.forfeitedSar}, 0)
          < ${bookings.totalAmount} + coalesce(${bookings.walletAppliedSar}, 0)`,
          lte(bookings.cancelledAt, new Date(Date.now() - 3_600_000)),
        ),
        columns: { referenceCode: true, totalAmount: true, walletAppliedSar: true },
      });
      if (orphanedRefunds.length > 0) {
        await notifyAdmin('refund_due', {
          problem:
            'cancelled paid bookings with an incomplete refund journal (crashed mid-cancel?)',
          count: orphanedRefunds.length,
          bookings: orphanedRefunds
            .map((b) => `${b.referenceCode} (${b.totalAmount + b.walletAppliedSar} SAR)`)
            .join(', '),
        });
      }
    },
    undefined,
  );
}

export async function sweepRefundOutOrphans(run: PassRunner) {
  // Pass 1d — refund-out orphan sweep (2026-08-01 ninth audit). The
  // refund-out flow debits the wallet in its own transaction and only
  // then calls `executeRefund` for the card leg; a crash between the
  // two leaves the guest's credit gone with NO card refund, NO
  // `refundDueSar` queue entry, and — because the debit's idempotency
  // key survives — every retry refused as `already_requested`,
  // permanently. Detect: a `refund-out:` reversal older than an hour
  // whose booking has no queue entry and no gateway refund recorded
  // after the debit. Recovery: stamp the card leg into the manual
  // queue (conditional, never clobbering a concurrent claim) + alert.
  // The admin action's in-flight and unknown-outcome guards keep this
  // stamp from double-firing a live reversal.
  await run.pass(
    '1d-refund-out-sweep',
    async () => {
      const orphanedRefundOuts = await db
        .select({
          bookingId: walletLedger.bookingId,
          amountSar: sql<number>`-${walletLedger.amountSar}`,
          reference: bookings.referenceCode,
        })
        .from(walletLedger)
        .innerJoin(bookings, eq(bookings.id, walletLedger.bookingId))
        .where(
          and(
            sql`${walletLedger.idempotencyKey} like 'refund-out:%'`,
            lte(walletLedger.createdAt, new Date(Date.now() - 3_600_000)),
            isNull(bookings.refundDueSar),
            sql`not exists (
                select 1 from ${paymentEvents} pe
                where pe.booking_id = ${walletLedger.bookingId}
                  and pe.type in ('refund_succeeded', 'manual_refund_recorded')
                  and pe.created_at >= ${walletLedger.createdAt}
              )`,
          ),
        );
      for (const row of orphanedRefundOuts) {
        if (!row.bookingId) continue;
        await db
          .update(bookings)
          .set({ refundDueSar: row.amountSar })
          .where(and(eq(bookings.id, row.bookingId), isNull(bookings.refundDueSar)));
        await notifyAdmin('refund_due', {
          problem: 'refund-out debited the wallet but no card refund was recorded',
          reference: row.reference,
          amountSar: row.amountSar,
          action: 'verify in the HyperPay console, then settle or record the queued refund',
        });
      }
    },
    undefined,
  );
}
