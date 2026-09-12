import 'server-only';

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, experiences, guests, hosts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { sendBookingCompletedEmails } from '@/features/bookings/lib/booking-email';
import { sendRebookEmail, sendWinbackEmail } from '@/features/marketing/lifecycle-email';
import { addDays } from '@/features/bookings/lib/availability';
import { paymentCollected } from '@/features/bookings/lib/payout-sql';
import type { PassRunner } from '@/features/maintenance/runner';
import { REMINDER_LIMIT, COMPLETION_LIMIT } from '@/features/maintenance/runner';

/**
 * Post-experience lifecycle: auto-complete collected bookings the day
 * after, then the D+7 rebook and D+90 win-back marketing.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function autoCompleteBookings(run: PassRunner, todayRiyadh: string) {
  // Pass 4 — auto-complete. A confirmed, collected booking whose date
  // has passed becomes `completed` the next day (owner decision:
  // date + 1 day). Completion gates payouts AND reviews — relying on
  // hosts to press the button quietly starved both. Hosts can still
  // cancel/dispute before the grace day ends; admin can still refund
  // after.
  //
  // Bounded per run (2026-08-01 ninth audit): each completion fans out
  // several DB reads plus up to two email sends, all sequential on
  // this pool. The CAP IS ON THE FLIP, not the email loop — capping
  // the loop instead would silently lose the skipped bookings'
  // notifications forever, since only this run's `returning` set ever
  // sees them. Rows past the cap simply complete on a later hourly
  // run; a huge day delays completion by a few hours, never drops it.
  // Suspended hosts are EXCLUDED (2026-08-02 ops audit P0-1), matching
  // the reminder pass above: suspension is an emergency takedown, and
  // auto-completing its bookings would mark never-delivered experiences
  // `completed` — making them payout-eligible and review-eligible — the
  // day after they silently didn't happen. These rows stay `confirmed`
  // until an operator resolves them (the dashboard queue lists them);
  // if the host is reinstated instead, the next run completes them.
  const completed = await run.pass(
    '4-auto-complete',
    async () => {
      const hostNotSuspended = () =>
        sql`${bookings.experienceId} in (
      select ${experiences.id} from ${experiences}
      join ${hosts} on ${hosts.id} = ${experiences.hostId}
      where ${hosts.verificationStatus} <> 'suspended'
    )`;
      const rows = await db
        .update(bookings)
        .set({ status: 'completed' })
        .where(
          and(
            eq(bookings.status, 'confirmed'),
            sql`${bookings.date} < ${todayRiyadh}`,
            paymentCollected(),
            hostNotSuspended(),
            // The subquery repeats every outer gate: an uncollected row
            // must not occupy the LIMIT window, or it would starve
            // completable rows behind it forever.
            sql`${bookings.id} in (
          select id from ${bookings}
          where ${bookings.status} = 'confirmed'
            and ${bookings.date} < ${todayRiyadh}
            and ${paymentCollected()}
            and ${hostNotSuspended()}
          order by ${bookings.date} asc
          limit ${COMPLETION_LIMIT}
        )`,
          ),
        )
        .returning({ id: bookings.id, reference: bookings.idempotencyKey });

      // Close the loop on each completion: review invite to the guest,
      // payout-owed notice to the host. Sequential (pool discipline, same
      // as every other pass) and per-row best-effort — one failed send
      // must not starve the rest, and the dedupe keys make the next run
      // safe to re-attempt.
      for (const row of rows) {
        try {
          await sendBookingCompletedEmails(row.reference);
        } catch (error) {
          reportError(error, { surface: 'cron-completed-email', reference: row.reference });
        }
      }
      return rows;
    },
    [] as Array<{ id: string; reference: string }>,
  );
  return completed;
}

export async function sendPostTripMarketing(run: PassRunner, todayRiyadh: string) {
  // Pass 4b — post-trip marketing (2026-08-15 marketing audit). D+7
  // rebook and D+90 win-back emails off each completed booking's date.
  // Everything restrictive lives in the SENDER (consent, unsubscribe
  // link, suppression scope, completed-status re-check); this pass
  // only shortlists candidates cheaply. A full-day date window +
  // ledger dedupe per (stage, reference) means the hourly cadence
  // re-offers each row all day but delivers at most once, and a
  // booking that misses its day (downtime) is skipped rather than
  // sent stale. Win-back additionally requires no later live booking —
  // a guest who came back on their own must not get a "we miss you".
  const marketed = await run.pass(
    '4b-post-trip-marketing',
    async () => {
      let marketed = 0;
      const marketingStages: Array<{
        date: string;
        send: (reference: string) => Promise<void>;
        requireNoLaterBooking: boolean;
      }> = [
        { date: addDays(todayRiyadh, -7), send: sendRebookEmail, requireNoLaterBooking: false },
        { date: addDays(todayRiyadh, -90), send: sendWinbackEmail, requireNoLaterBooking: true },
      ];
      for (const stage of marketingStages) {
        const candidates = await db
          .select({ reference: bookings.idempotencyKey })
          .from(bookings)
          .innerJoin(guests, eq(bookings.guestId, guests.id))
          .where(
            and(
              eq(bookings.status, 'completed'),
              eq(bookings.date, stage.date),
              isNotNull(guests.marketingConsentAt),
              isNotNull(guests.email),
              ...(stage.requireNoLaterBooking
                ? [
                    sql`not exists (
                  select 1 from ${bookings} b2
                  where b2.guest_id = ${bookings.guestId}
                    and b2.date > ${bookings.date}
                    and b2.status not in ('cancelled', 'declined', 'expired')
                )`,
                  ]
                : []),
            ),
          )
          .limit(REMINDER_LIMIT);
        for (const row of candidates) {
          try {
            await stage.send(row.reference);
            marketed += 1;
          } catch (error) {
            reportError(error, { surface: 'cron-marketing', reference: row.reference });
          }
        }
      }
      return marketed;
    },
    0,
    { bestEffort: true },
  );
  return marketed;
}
