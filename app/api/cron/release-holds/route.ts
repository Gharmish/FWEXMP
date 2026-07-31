import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  isNotNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import {
  authThrottleEvents,
  bookings,
  experiences,
  guests,
  hosts,
  platformSettings,
  walletLedger,
} from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { settleBooking } from '@/features/payments/settle';
import {
  RETRYABLE_BOOKING_SENDERS,
  sendBookingCompletedEmails,
  sendBookingReceiptEmail,
  sendBookingExpiredEmail,
  sendBookingPaymentLapsedEmail,
  sendBookingPrepareReminderEmail,
  sendBookingDepartureReminderEmail,
  sendHostHoldLapsedEmail,
} from '@/features/bookings/lib/booking-email';
import { listRetryableDeliveries } from '@/lib/notifications/ledger';
import { addDays } from '@/features/bookings/lib/availability';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { releaseWalletReservation } from '@/features/wallet/reservation';
import { paymentCollected, rolling12mTurnoverExpr } from '@/features/bookings/lib/payout-sql';
import {
  VAT_MANDATORY_THRESHOLD_SAR,
  VAT_THRESHOLD_ALERT_RATIO,
} from '@/features/admin/vat/thresholds';

/** Cap reconciliation work per run so a backlog can't blow the function budget. */
const RECONCILE_LIMIT = 100;

/** Cap reminder sends per run for the same reason. */
const REMINDER_LIMIT = 100;

/** Cap notification retries per run for the same reason. */
const RETRY_LIMIT = 50;

/**
 * Scheduled release of expired payment holds. Vercel Cron runs this DAILY
 * (`0 3 * * *` in vercel.json — the Hobby-plan ceiling). The guest
 * reminders in Pass 3 fire at per-booking offsets (~24h and ~3h before
 * start) that a once-daily run can't hit, so an **external scheduler
 * (Supabase pg_cron) hits this same URL hourly** with the CRON_SECRET
 * bearer token — see supabase/ for the job. The route is idempotent and
 * safe at any cadence: every pass is guarded by state + dedupe flags, so
 * the daily Vercel run and the hourly external run never conflict or
 * double-act.
 *
 * Passes:
 *
 * 0. **Expire requests** — flips `pending` request-to-book rows past their
 *    approval deadline to `expired` (pay-after-approval: nothing was charged).
 *
 * 1. **Release** — cancels bookings whose payment window has passed **and are
 *    still `unpaid`** (no checkout was ever prepared → no payment in flight).
 *    Frees the spot for capacity with no late-settlement race: `createCheckout`
 *    refuses any cancelled/expired hold, so a released seat can never be charged.
 *
 * 2. **Reconcile** — re-settles bookings stuck in `processing` past their hold
 *    window. Settlement normally happens synchronously when the HyperPay widget
 *    redirects the shopper to `/pay/return`; if the shopper's card is charged
 *    during 3DS but they close the tab before the redirect fires, the booking
 *    would otherwise stay `processing` forever (the release pass deliberately
 *    never cancels `processing`). This pass re-queries HyperPay — the source of
 *    truth — via the idempotent `settleBooking`, confirming paid bookings and
 *    failing rejected ones. The OPPWA webhook (app/api/webhooks/hyperpay)
 *    normally covers closed-tab settlements; this pass is the redundant
 *    safety net for webhook outages, and it ALERTS (2026-07-20 audit) when
 *    a booking has been reconcile-failing for over a day — captured money
 *    must never sit invisible.
 *
 * 3. **Reminders** — two per-booking guest emails: a ~24h "get ready"
 *    (`reminderSentAt`) and a ~3h day-of "see you soon"
 *    (`finalReminderSentAt`). Independent dedupe flags; timing computed
 *    from each booking's Riyadh start instant.
 *
 * 3b. **Notification retries** — re-fires booking notifications whose
 *    provider attempt failed (delivery-ledger rows at `failed` with
 *    attempts left, ≤48h old). Senders re-render from current DB state;
 *    `claimDelivery` re-claims per channel with an attempts cap, so the
 *    sweep is idempotent and can never double-send.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. With no
 * secret set the route rejects everything, so the job is inert until
 * configured.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.CRON_SECRET;
  // Constant-time comparison, same as the webhook verifiers — a plain
  // `!==` leaks match-prefix timing (impractical over HTTP, but there's
  // no reason for this check to be the odd one out).
  const provided = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authorized =
    Boolean(secret) &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!serverEnv.DATABASE_URL) {
    return NextResponse.json({ released: 0, skipped: 'no-db' });
  }

  try {
    // Pass 0 — expire undecided booking requests. A `pending` request the
    // host neither approved nor declined within the approval window moves
    // to `expired` (terminal, frees the soft-held capacity; nothing was
    // ever charged in the pay-after-approval model). The guest is told —
    // best-effort, gated on having an email on file.
    const expired = await db
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
    for (const row of expired) {
      try {
        await sendBookingExpiredEmail(row.reference);
      } catch (error) {
        reportError(error, { surface: 'cron-expire-requests', reference: row.reference });
      }
    }

    // `failed` joins `unpaid` here: a final failed attempt holds no
    // payment in flight (unlike `processing`), so past the deadline the
    // booking is released the same way. `createCheckout` refuses both
    // once the hold has lapsed, so a released seat can never be charged.
    const released = await db
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
    for (const row of released) {
      // A lapsed hold with checkout-applied credit was only a
      // reservation — return it before the emails (never silently
      // strand a guest's credit on a booking they can no longer pay).
      if (row.walletAppliedSar > 0) {
        try {
          await releaseWalletReservation(row.id);
        } catch (error) {
          reportError(error, { surface: 'cron-release-holds:wallet', reference: row.reference });
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
        reportError(error, { surface: 'cron-release-holds:hostEmail', reference: row.reference });
      }
    }

    // Pass 1b — stranded-reservation sweep (2026-07-28 audit). Any path
    // that flips a booking terminal can in principle die between the
    // flip and its wallet release (the fast-path release above included,
    // in older deploys where it ran outside the transaction). A terminal
    // UNPAID booking still carrying `walletAppliedSar > 0` is exactly
    // that stranded state — the guest's credit debited for a booking
    // that no longer exists. `releaseWalletReservation` re-checks under
    // FOR UPDATE, so re-running here is idempotent and race-free.
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

    // Pass 1c — orphaned-refund watch (2026-07-28 audit). A cancellation
    // that owed the guest money commits its flip first and refunds
    // second; a crash in between leaves `cancelled + paid` with NO
    // refund journal at all (no refundedAmountSar, no refundDueSar) and
    // no forfeit stamp — a debt with no queue entry. The policy amount
    // is contextual, so this pass only ALERTS (hourly, until an admin
    // settles it via the manual refund action) rather than moving money.
    const orphanedRefunds = await db.query.bookings.findMany({
      where: and(
        eq(bookings.status, 'cancelled'),
        eq(bookings.paymentStatus, 'paid'),
        isNull(bookings.refundDueSar),
        isNull(bookings.refundedAmountSar),
        isNull(bookings.forfeitedSar),
        lte(bookings.cancelledAt, new Date(Date.now() - 3_600_000)),
      ),
      columns: { referenceCode: true, totalAmount: true, walletAppliedSar: true },
    });
    if (orphanedRefunds.length > 0) {
      await notifyAdmin('refund_due', {
        problem: 'cancelled paid bookings with no refund journal (crashed mid-cancel?)',
        count: orphanedRefunds.length,
        bookings: orphanedRefunds
          .map((b) => `${b.referenceCode} (${b.totalAmount + b.walletAppliedSar} SAR)`)
          .join(', '),
      });
    }

    // Pass 2 — reconcile stuck holds against HyperPay. Only those whose
    // hold window has elapsed, so a shopper still mid-3DS is never
    // disturbed; `settleBooking` is idempotent and safe to re-run.
    // `cancelled` rows are INCLUDED: a guest can cancel mid-3DS and the
    // charge still capture — settle detects that and auto-refunds, so
    // excluding them would leave captured money invisible forever.
    //
    // Scoped to `processing` deliberately. The 2026-07-28 re-audit
    // widened this to `unpaid` rows carrying a checkoutId, reasoning
    // that a wallet release flips `processing → unpaid` and could park a
    // real capture. The third audit showed that doesn't work: every
    // writer that flips to `unpaid` (wallet release, promo/credit
    // supersession) ALSO moves `totalAmount`, so settle's amount guard
    // refuses on every retry — the row never leaves the candidate set,
    // re-alerting hourly forever and squatting on RECONCILE_LIMIT until
    // genuinely-stuck `processing` rows stop being scanned at all. Those
    // writers now clear the dead `checkoutId` instead (see
    // reservation.ts / promo + wallet checkout actions), so a stale
    // widget can't be mistaken for a live checkout.
    //
    // Residual gap, deliberately not papered over: a guest who completes
    // payment on a SUPERSEDED widget is captured at the old amount with
    // no live pointer to poll. `checkout_superseded` in the payment
    // ledger is the forensic trail. The OPPWA webhook
    // (app/api/webhooks/hyperpay) IS built and is the automatic catcher
    // when it fires; a capture it never sees needs HyperPay
    // settlement-report reconciliation. (Corrected 2026-07-28 — the
    // "reserved, not built" claim was false and had already caused one
    // P1 fix to be designed on a wrong premise.)
    const stuck = await db.query.bookings.findMany({
      where: and(
        eq(bookings.paymentStatus, 'processing'),
        isNotNull(bookings.checkoutId),
        // A superseded checkout can never settle at its prepared
        // amount, so re-polling it just burns the bounded budget and
        // re-alerts hourly. The id is KEPT so a late capture is still
        // resolvable by settle/webhook (2026-07-28 fourth audit) —
        // this marker is what stops the cron from chasing it.
        isNull(bookings.checkoutSupersededAt),
        isNotNull(bookings.paymentDeadline),
        lte(bookings.paymentDeadline, new Date()),
        notInArray(bookings.status, ['completed', 'refunded']),
      ),
      // Oldest deadline first: a bounded pass must make progress on the
      // longest-stuck money rather than re-scanning the same head.
      orderBy: (b, { asc }) => [asc(b.paymentDeadline)],
      columns: { idempotencyKey: true },
      with: { guest: { columns: { preferredLanguage: true } } },
      limit: RECONCILE_LIMIT,
    });

    let settled = 0;
    let anomalies = 0;
    for (const row of stuck) {
      const outcome = await settleBooking(row.idempotencyKey);
      if (outcome === 'success') {
        settled += 1;
        // The guest's receipt + simplified tax invoice (2026-07-28 fifth
        // audit). The return route and the webhook both send it; this
        // pass didn't, so a booking rescued here told the HOST money
        // arrived and left the guest with nothing — and ZATCA requires
        // the invoice be issued to the customer. Best-effort.
        try {
          await sendBookingReceiptEmail(row.idempotencyKey);
        } catch (error) {
          reportError(error, {
            surface: 'cron-reconcile:receipt',
            reference: row.idempotencyKey,
          });
        }
      }
      // `anomaly` is PERMANENT — a real capture that can never match
      // this booking. Settle has already alerted a human once; counting
      // it here (rather than treating it as an ordinary failure) is what
      // keeps the run's summary honest. Suppressing the hourly re-alert
      // is settle's job, via the anomaly stamp.
      if (outcome === 'anomaly') anomalies += 1;
    }

    // Pass 2b — stuck-settlement aging alert (2026-07-20 audit). A
    // booking that keeps failing to settle (gateway unreachable, amount
    // anomaly, settings read failing) stays `processing` silently — the
    // guest's card may be captured while the DB shows nothing. Alert as
    // each booking crosses 24h stuck (the one-hour window under the
    // hourly cadence keeps it one alert per booking, not one per run).
    //
    // Pass 2c below covers the rows this predicate structurally CANNOT
    // see — see its comment. A live data audit (2026-07-28) found two
    // real bookings totalling 800 SAR sitting in exactly that blind
    // spot since June, never reconciled and never alerted.
    try {
      const [aging] = await db
        .select({
          crossing: sql<number>`count(*) filter (where ${bookings.paymentDeadline} > now() - interval '25 hours')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.paymentStatus, 'processing'),
            isNotNull(bookings.checkoutId),
            isNotNull(bookings.paymentDeadline),
            sql`${bookings.paymentDeadline} <= now() - interval '24 hours'`,
            notInArray(bookings.status, ['completed', 'refunded']),
          ),
        );
      if (aging && aging.crossing > 0) {
        await notifyAdmin('settle_stuck', {
          newlyStuckOver24h: aging.crossing,
          totalStuckOver24h: aging.total,
          action:
            'check HyperPay + /admin/bookings processing rows; money may be captured but unrecorded',
        });
      }

      // Pass 2c — the reconcile BLIND SPOT (2026-07-28 sixth audit).
      // Pass 2 and the aging alert above both require a non-null,
      // elapsed `paymentDeadline` and a non-terminal status. A booking
      // left `processing` with NO deadline, or advanced to `completed`
      // while its payment was still in flight, satisfies neither — so it
      // is never re-settled AND never alerted, forever. That is the
      // worst possible combination for money that may already be
      // captured at the gateway, and it is not hypothetical: two such
      // rows have been sitting in production since 2026-06-04.
      //
      // Deliberately alert-only. Auto-settling a `completed` booking, or
      // one whose hold window was never set, would move money on a row
      // whose history nobody has reconstructed — a human checks HyperPay
      // first. Re-alerts are bounded by the same `lastCronRunAt` cadence
      // as everything else here.
      const [blind] = await db
        .select({
          n: sql<number>`count(*)::int`,
          refs: sql<string>`coalesce(string_agg(${bookings.referenceCode}, ', '), '')`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.paymentStatus, 'processing'),
            isNotNull(bookings.checkoutId),
            or(
              isNull(bookings.paymentDeadline),
              inArray(bookings.status, ['completed', 'refunded']),
            ),
          ),
        );
      // De-duped to once per 30 days (2026-07-28 seventh audit). These
      // rows are stuck BY DEFINITION — nothing clears them without a
      // human — so an undeduped alert emails every run, forever. The
      // round-6 commit claimed `lastCronRunAt` bounded this; it does
      // not, that column is display-only. Same stamp pattern as the VAT
      // threshold alert below.
      if (blind && blind.n > 0) {
        const [stamp] = await db
          .select({ alertedAt: platformSettings.blindspotAlertedAt })
          .from(platformSettings)
          .where(eq(platformSettings.id, 'platform'));
        const lastBlindAlert = stamp?.alertedAt?.getTime() ?? 0;
        const BLINDSPOT_ALERT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastBlindAlert > BLINDSPOT_ALERT_INTERVAL_MS) {
          await notifyAdmin('settle_stuck', {
            problem:
              'processing rows invisible to the reconcile pass (no deadline, or terminal status)',
            count: blind.n,
            references: blind.refs,
            action: 'check these checkout ids at HyperPay directly — they are never auto-retried',
          });
          await db
            .insert(platformSettings)
            .values({ id: 'platform', blindspotAlertedAt: new Date() })
            .onConflictDoUpdate({
              target: platformSettings.id,
              set: { blindspotAlertedAt: new Date() },
            });
        }
      }
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:settle-aging' });
    }

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
    const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
      new Date(),
    );
    const tomorrowRiyadh = addDays(todayRiyadh, 1);
    // Anything within 24h of start falls on the Riyadh "today" or
    // "tomorrow" date; scoping to those two days keeps the scan small.
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

    let reminded = 0;
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

    // Pass 3b — retry failed notification sends. Only types in the
    // retry map (re-derivable from the booking row) are re-fired; a
    // sender whose booking no longer qualifies (e.g. refunded since)
    // simply no-ops and the row ages out of the 48h window.
    let retried = 0;
    const retryable = await listRetryableDeliveries(RETRY_LIMIT);
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

    // Pass 4 — auto-complete. A confirmed, collected booking whose date
    // has passed becomes `completed` the next day (owner decision:
    // date + 1 day). Completion gates payouts AND reviews — relying on
    // hosts to press the button quietly starved both. Hosts can still
    // cancel/dispute before the grace day ends; admin can still refund
    // after.
    const completed = await db
      .update(bookings)
      .set({ status: 'completed' })
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          sql`${bookings.date} < ${todayRiyadh}`,
          paymentCollected(),
        ),
      )
      .returning({ id: bookings.id, reference: bookings.idempotencyKey });

    // Close the loop on each completion: review invite to the guest,
    // payout-owed notice to the host. Sequential (pool discipline, same
    // as every other pass) and per-row best-effort — one failed send
    // must not starve the rest, and the dedupe keys make the next run
    // safe to re-attempt.
    for (const row of completed) {
      try {
        await sendBookingCompletedEmails(row.reference);
      } catch (error) {
        reportError(error, { surface: 'cron-completed-email', reference: row.reference });
      }
    }

    // Pass 5 — VAT accounting guards (daily, best-effort; failures are
    // logged but never block the operational passes above).
    try {
      const [settings] = await db
        .select({
          vatEnabled: platformSettings.vatEnabled,
          vatRegistrationNumber: platformSettings.vatRegistrationNumber,
          vatThresholdAlertedAt: platformSettings.vatThresholdAlertedAt,
        })
        .from(platformSettings)
        .where(eq(platformSettings.id, 'platform'))
        .limit(1);

      // 5a — stamp integrity: while VAT is on, every payment settled in
      // the last 48h must carry a rate snapshot. A miss means output tax
      // is being under-declared — the team must reconcile before filing.
      if (settings?.vatEnabled && settings.vatRegistrationNumber) {
        const [unstamped] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.paymentStatus, 'paid'),
              isNull(bookings.vatRateBps),
              sql`${bookings.paidAt} >= now() - interval '48 hours'`,
            ),
          );
        if (unstamped && unstamped.count > 0) {
          await notifyAdmin('vat_stamp_missing', {
            count: unstamped.count,
            window: 'last 48 hours',
            action: 'stamp these bookings before the next VAT filing (/admin/vat)',
          });
        }
      }

      // 5b — registration-threshold watch: rolling-12-month paid sales
      // (net of refunds) vs the ZATCA mandatory line. Alerts at 90% so
      // registration can be arranged ahead of the legal deadline;
      // de-duped to once per 30 days via the stamp column.
      const [turnover] = await db
        .select({
          // ONE shared expression with /admin/vat (2026-07-28 sixth
          // audit) — the two had drifted into different formulas under
          // the same label, compared against the same threshold.
          netSar: rolling12mTurnoverExpr(),
        })
        .from(bookings);
      const netSar = turnover?.netSar ?? 0;
      const alertFloor = VAT_MANDATORY_THRESHOLD_SAR * VAT_THRESHOLD_ALERT_RATIO;
      const lastAlert = settings?.vatThresholdAlertedAt?.getTime() ?? 0;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (netSar >= alertFloor && Date.now() - lastAlert > THIRTY_DAYS_MS) {
        await notifyAdmin('vat_threshold', {
          rolling12mNetSar: netSar,
          mandatoryThresholdSar: VAT_MANDATORY_THRESHOLD_SAR,
          percent: Math.round((netSar / VAT_MANDATORY_THRESHOLD_SAR) * 100),
          action: 'arrange ZATCA VAT registration, then enable VAT in /admin/settings',
        });
        await db
          .update(platformSettings)
          .set({ vatThresholdAlertedAt: new Date() })
          .where(eq(platformSettings.id, 'platform'));
      }
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:vat-guards' });
    }

    // Pass 5c — negative-take watch (2026-07-20 audit). Platform-funded
    // promo + wallet credit stack with no floor BY DESIGN (owner-
    // arbitrated model), so the guardrail is observability, not a block:
    // alert when payments settled in the last 24h carried a negative
    // platform take (payout to the host exceeds the money collected), so
    // a farmed code or an over-generous stack is seen the day it starts,
    // not at month-end.
    try {
      const vatPortion = sql`coalesce(round(${bookings.totalAmount} * ${bookings.vatRateBps}::numeric / (10000 + ${bookings.vatRateBps})), 0)`;
      const netBase = sql`(${bookings.totalAmount} + coalesce(${bookings.discountSar}, 0) + coalesce(${bookings.walletAppliedSar}, 0) - ${vatPortion})`;
      const take = sql`(round(${netBase} * least(10000, greatest(0, ${bookings.commissionBps})) / 10000.0) - coalesce(${bookings.discountSar}, 0) - coalesce(${bookings.walletAppliedSar}, 0))`;
      const [negative] = await db
        .select({
          count: sql<number>`count(*)::int`,
          lossSar: sql<number>`coalesce(sum(-${take}), 0)::int`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.paymentStatus, 'paid'),
            sql`${bookings.paidAt} >= now() - interval '24 hours'`,
            sql`${take} < 0`,
          ),
        );
      if (negative && negative.count > 0) {
        await notifyAdmin('negative_take', {
          bookings: negative.count,
          platformLossSar: negative.lossSar,
          window: 'last 24 hours',
          action: 'review promo/credit stacking on these bookings (/admin/bookings)',
        });
      }
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:negative-take' });
    }

    // Pass 6 — wallet credit expiry sweep (2026-07-20 audit: `expiresAt`
    // was recorded but never enforced, so "expiring" goodwill was an
    // unbounded liability that stayed spendable forever). For each
    // expired positive lot without an `expiry:<lotId>` reversal, debit
    // min(current balance, lot amount) under the guest's advisory lock —
    // the balance floor means a lot that was already spent expires as 0
    // (skipped; the 30-day lookback stops eternal re-scans of dead
    // lots, and deliberately avoids expiring NEW credit issued long
    // after the old lot lapsed).
    let expiredCreditSar = 0;
    try {
      const expiredLots = await db
        .select({
          id: walletLedger.id,
          guestId: walletLedger.guestId,
          amountSar: walletLedger.amountSar,
        })
        .from(walletLedger)
        .where(
          and(
            sql`${walletLedger.amountSar} > 0`,
            isNotNull(walletLedger.expiresAt),
            lte(walletLedger.expiresAt, new Date()),
            sql`${walletLedger.expiresAt} >= now() - interval '30 days'`,
            sql`not exists (select 1 from wallet_ledger sweep where sweep.idempotency_key = 'expiry:' || wallet_ledger.id::text)`,
          ),
        )
        .limit(RECONCILE_LIMIT);
      for (const lot of expiredLots) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'wallet:' + lot.guestId}))`);
          const [row] = await tx
            .select({ balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int` })
            .from(walletLedger)
            .where(eq(walletLedger.guestId, lot.guestId));
          const expire = Math.min(row?.balance ?? 0, lot.amountSar);
          if (expire <= 0) return;
          await tx
            .insert(walletLedger)
            .values({
              guestId: lot.guestId,
              type: 'expiry',
              amountSar: -expire,
              idempotencyKey: `expiry:${lot.id}`,
              actorUserId: null,
              note: 'credit lot expired',
              expiresAt: null,
            })
            .onConflictDoNothing({ target: walletLedger.idempotencyKey });
          expiredCreditSar += expire;
        });
      }
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:wallet-expiry' });
    }

    // Pass 7 — throttle-event prune (2026-07-28 audit). The abuse
    // counters only ever look back an hour at most; the schema comment
    // said "prune opportunistically" but nothing did, so the table grew
    // forever. 24h of retention keeps a day of forensic context while
    // capping growth. Best-effort.
    try {
      await db
        .delete(authThrottleEvents)
        .where(lte(authThrottleEvents.createdAt, new Date(Date.now() - 24 * 3_600_000)));
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:throttlePrune' });
    }

    // Heartbeat — the admin dashboard flags a stale stamp, so a silently
    // dead cron (expired secret, removed schedule, plan change) is
    // visible instead of quietly stopping expiry/release/reminders.
    try {
      await db
        .insert(platformSettings)
        .values({ id: 'platform', lastCronRunAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.id,
          set: { lastCronRunAt: new Date() },
        });
    } catch (error) {
      reportError(error, { surface: 'cron-release-holds:heartbeat' });
    }

    return NextResponse.json({
      expired: expired.length,
      released: released.length,
      reconciled: stuck.length,
      settled,
      anomalies,
      reminded,
      retried,
      completed: completed.length,
      expiredCreditSar,
    });
  } catch (error) {
    reportError(error, { surface: 'cron-release-holds' });
    await notifyAdmin('cron_failed', {
      job: 'release-holds',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
