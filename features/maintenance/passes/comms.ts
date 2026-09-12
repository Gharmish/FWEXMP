import 'server-only';

import { and, asc, eq, inArray, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, conversationMessages, experiences, guests, hosts } from '@/db/schema';
import { reportError } from '@/lib/log';
import {
  RETRYABLE_BOOKING_SENDERS,
  sendBookingPrepareReminderEmail,
  sendBookingDepartureReminderEmail,
  sendBookingAwaitingPaymentEmail,
} from '@/features/bookings/lib/booking-email';
import { expireStaleQueuedDeliveries, listRetryableDeliveries } from '@/lib/notifications/ledger';
import { addDays, todayInRiyadh } from '@/features/bookings/lib/availability';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { paymentCollected } from '@/features/bookings/lib/payout-sql';
import type { PassRunner } from '@/features/maintenance/runner';
import { REMINDER_LIMIT, RETRY_LIMIT } from '@/features/maintenance/runner';

/**
 * Guest-facing comms: the two-stage reminders, the pre-lapse payment nudge,
 * failed-delivery retries, stale-queued ageing and IBAN masking at rest.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function sendGuestReminders(run: PassRunner) {
  // Pass 3 — guest reminders. Two hourly-precision reminders over
  // confirmed, contactable (email OR phone — phone-only guests get the
  // WhatsApp reminder once Twilio is live) bookings starting soon: a
  // ~24h "get ready" and a ~3h day-of "see you soon". Each has its own dedupe flag
  // (`reminderSentAt` / `finalReminderSentAt`), so the hourly cadence,
  // manual triggers, and retries never double-send. Timing is computed
  // per booking from its Riyadh start instant, not the calendar day, so
  // an evening experience and a dawn one are each reminded on schedule.
  const nowMs = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const todayRiyadh = todayInRiyadh();
  const tomorrowRiyadh = addDays(todayRiyadh, 1);
  // Anything within 24h of start falls on the Riyadh "today" or
  // "tomorrow" date; scoping to those two days keeps the scan small.
  const reminded = await run.pass(
    '3-guest-reminders',
    async () => {
      let reminded = 0;
      const reminderCandidates = await db
        .select({
          id: bookings.id,
          reference: bookings.idempotencyKey,
          date: bookings.date,
          startTime: bookings.startTime,
          preferredLanguage: guests.preferredLanguage,
          reminderSentAt: bookings.reminderSentAt,
          finalReminderSentAt: bookings.finalReminderSentAt,
        })
        .from(bookings)
        .innerJoin(guests, eq(bookings.guestId, guests.id))
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .innerJoin(hosts, eq(experiences.hostId, hosts.id))
        .where(
          and(
            eq(bookings.status, 'confirmed'),
            // Only secured bookings (2026-09 engineering audit GAPA-02): an
            // instant booking is `confirmed` + unpaid for its 30-minute
            // hold, an approved request for up to 24h. Telling that guest
            // "see you tomorrow" and then "your hold expired" is the system
            // contradicting itself. Same predicate the completion pass uses.
            paymentCollected(),
            inArray(bookings.date, [todayRiyadh, tomorrowRiyadh]),
            // Never cheerfully remind a guest to show up for an experience
            // the platform has WITHDRAWN (2026-07-28 eighth audit).
            // Suspension force-pauses the host's listings, but this pass
            // joined only bookings+guests — so suspended-host guests kept
            // getting "get ready, see you tomorrow" for something that
            // must not run. The system telling someone a falsehood it
            // already knows is worse than telling them nothing.
            ne(hosts.verificationStatus, 'suspended'),
            or(isNotNull(guests.email), isNotNull(guests.phone)),
            or(isNull(bookings.reminderSentAt), isNull(bookings.finalReminderSentAt)),
          ),
        )
        // Bounded passes must make progress on the most urgent rows, not an
        // arbitrary 100 (Pass 2 already does this; this one didn't).
        .orderBy(asc(bookings.date), asc(bookings.startTime))
        .limit(REMINDER_LIMIT);

      for (const row of reminderCandidates) {
        const hoursUntil = (startInstant(row.date, row.startTime).getTime() - nowMs) / HOUR_MS;
        if (hoursUntil <= 0) continue; // already started — nothing to remind

        try {
          // Day-of "see you soon" (~3h). If this is due but the 24h "get
          // ready" never went out (a booking made less than 24h before
          // start), send only the departure email and stamp both flags —
          // no point in two emails seconds apart.
          if (row.finalReminderSentAt === null && hoursUntil <= 3) {
            await sendBookingDepartureReminderEmail(row.reference, row.preferredLanguage);
            await db
              .update(bookings)
              .set({
                finalReminderSentAt: new Date(),
                reminderSentAt: row.reminderSentAt ?? new Date(),
              })
              .where(eq(bookings.id, row.id));
            reminded += 1;
            continue;
          }
          // "Get ready" (~24h).
          if (row.reminderSentAt === null && hoursUntil <= 24) {
            await sendBookingPrepareReminderEmail(row.reference, row.preferredLanguage);
            await db
              .update(bookings)
              .set({ reminderSentAt: new Date() })
              .where(eq(bookings.id, row.id));
            reminded += 1;
          }
        } catch (error) {
          reportError(error, { surface: 'cron-reminders', reference: row.reference });
        }
      }
      return reminded;
    },
    0,
    { bestEffort: true },
  );
  return reminded;
}

export async function nudgeUnpaidHolds(run: PassRunner) {
  // Pass 3a — pre-lapse payment nudge (2026-08-15 marketing audit).
  // The highest-intent abandonment in the funnel used to be worked
  // only AFTER expiry ("your hold lapsed", a post-mortem). This pass
  // catches unpaid holds whose deadline is ~2.5h out and nudges while
  // there is still time to act. Idempotent at any cadence: the
  // notification ledger allows exactly one `booking_payment_reminder`
  // per booking, and the sender re-checks paid/lapsed state at send
  // time — so the hourly runs, manual triggers, and this window
  // overlapping across runs can never double-send.
  const nudged = await run.pass(
    '3a-payment-nudge',
    async () => {
      let nudged = 0;
      const nudgeCandidates = await db
        .select({ reference: bookings.idempotencyKey })
        .from(bookings)
        .where(
          and(
            inArray(bookings.status, ['pending', 'confirmed']),
            ne(bookings.paymentStatus, 'paid'),
            isNotNull(bookings.paymentDeadline),
            sql`${bookings.paymentDeadline} > now()`,
            sql`${bookings.paymentDeadline} <= now() + interval '150 minutes'`,
          ),
        )
        .orderBy(asc(bookings.paymentDeadline))
        .limit(REMINDER_LIMIT);
      for (const row of nudgeCandidates) {
        try {
          await sendBookingAwaitingPaymentEmail(row.reference, 'reminder');
          nudged += 1;
        } catch (error) {
          reportError(error, { surface: 'cron-payment-nudge', reference: row.reference });
        }
      }
      return nudged;
    },
    0,
    { bestEffort: true },
  );
  return nudged;
}

export async function retryFailedDeliveries(run: PassRunner) {
  // Pass 3b — retry failed notification sends. Only types in the
  // retry map (re-derivable from the booking row) are re-fired; a
  // sender whose booking no longer qualifies (e.g. refunded since)
  // simply no-ops and the row ages out of the 48h window.
  const retried = await run.pass(
    '3b-notification-retry',
    async () => {
      let retried = 0;
      // Pass the sender registry's own keys as the filter (2026-08-01
      // ninth audit) — the query used to return types this loop cannot
      // send, which then squatted on the bounded budget permanently.
      const retryable = await listRetryableDeliveries(
        RETRY_LIMIT,
        Object.keys(RETRYABLE_BOOKING_SENDERS),
      );
      if (retryable.length > 0) {
        const refRows = await db.query.bookings.findMany({
          where: inArray(bookings.id, [...new Set(retryable.map((row) => row.bookingId))]),
          columns: { id: true, idempotencyKey: true },
        });
        const referenceById = new Map(refRows.map((b) => [b.id, b.idempotencyKey]));
        for (const row of retryable) {
          const sender = RETRYABLE_BOOKING_SENDERS[row.type];
          const reference = referenceById.get(row.bookingId);
          if (!sender || !reference) continue;
          try {
            await sender(reference, row.locale ?? 'ar');
            retried += 1;
          } catch (error) {
            reportError(error, { surface: 'cron-notification-retry', reference, type: row.type });
          }
        }
      }
      return retried;
    },
    0,
    { bestEffort: true },
  );
  return retried;
}

export async function expireStaleQueued(run: PassRunner) {
  // Pass 3d — stale `queued` deliveries (2026-09 engineering audit
  // OPS-07 / GAPB-04). A function killed between claiming a ledger row
  // and the provider result leaves it `queued` forever: the retry sweep
  // above only selects `failed`, so the guest's receipt or reminder was
  // silently lost. Ageing them to `failed` hands them to that sweep.
  const staleQueuedRequeued = await run.pass(
    '3d-stale-queued',
    () => expireStaleQueuedDeliveries(15 * 60_000, RETRY_LIMIT),
    0,
    { bestEffort: true },
  );
  return staleQueuedRequeued;
}

export async function maskIbansAtRest(run: PassRunner) {
  // Pass 3e — IBANs at rest in the support thread (2026-09 engineering
  // audit AI-05). A guest types their IBAN into WhatsApp to get a refund;
  // the agent must read it verbatim to submit it, and the same IBAN is
  // then ENCRYPTED on the booking — while the message body kept it in
  // plaintext for the 12-month retention. Two days is enough for the
  // refund flow and an admin's eyes; after that keep the last four.
  const ibansMasked = await run.pass(
    '3e-iban-masking',
    async () => {
      const rows = await db
        .update(conversationMessages)
        .set({
          body: sql`regexp_replace(${conversationMessages.body}, '(SA)\\s?(?:\\d\\s?){18}((?:\\d\\s?){4})', '\\1…\\2', 'gi')`,
        })
        .where(
          sql`${conversationMessages.id} in (
            select id from ${conversationMessages}
            where ${conversationMessages.direction} = 'in'
              and ${conversationMessages.createdAt} <= now() - interval '48 hours'
              and ${conversationMessages.body} ~* 'SA\\s?(\\d\\s?){22}'
            limit ${RETRY_LIMIT}
          )`,
        )
        .returning({ id: conversationMessages.id });
      return rows.length;
    },
    0,
    { bestEffort: true },
  );
  return ibansMasked;
}
