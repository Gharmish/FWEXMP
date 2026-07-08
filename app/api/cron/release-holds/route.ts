import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray, isNull, isNotNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests, platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { settleBooking } from '@/features/payments/settle';
import {
  sendBookingExpiredEmail,
  sendBookingPaymentLapsedEmail,
  sendBookingPrepareReminderEmail,
  sendBookingDepartureReminderEmail,
  sendHostHoldLapsedEmail,
} from '@/features/bookings/lib/booking-email';
import { addDays } from '@/features/bookings/lib/availability';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { paymentCollected } from '@/features/bookings/lib/payout-sql';
import {
  VAT_MANDATORY_THRESHOLD_SAR,
  VAT_THRESHOLD_ALERT_RATIO,
} from '@/features/admin/vat/thresholds';

/** Cap reconciliation work per run so a backlog can't blow the function budget. */
const RECONCILE_LIMIT = 100;

/** Cap reminder sends per run for the same reason. */
const REMINDER_LIMIT = 100;

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
 *    failing rejected ones. It is the safety net for the missing OPPWA webhook.
 *
 * 3. **Reminders** — two per-booking guest emails: a ~24h "get ready"
 *    (`reminderSentAt`) and a ~3h day-of "see you soon"
 *    (`finalReminderSentAt`). Independent dedupe flags; timing computed
 *    from each booking's Riyadh start instant.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. With no
 * secret set the route rejects everything, so the job is inert until
 * configured.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
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
      .set({ status: 'cancelled' })
      .where(
        and(
          inArray(bookings.paymentStatus, ['unpaid', 'failed']),
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
      .returning({ id: bookings.id, reference: bookings.idempotencyKey });
    // An approved-then-never-paid request (or an abandoned instant hold)
    // was just released — tell the guest the hold lapsed, and the host
    // that the booking they were notified about evaporated. Best-effort.
    for (const row of released) {
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

    // Pass 2 — reconcile stuck `processing` holds against HyperPay. Only
    // those whose hold window has elapsed, so a shopper still mid-3DS is
    // never disturbed; `settleBooking` is idempotent and safe to re-run.
    // `cancelled` rows are INCLUDED: a guest can cancel mid-3DS and the
    // charge still capture — settle detects that and auto-refunds, so
    // excluding them would leave captured money invisible forever.
    const stuck = await db.query.bookings.findMany({
      where: and(
        eq(bookings.paymentStatus, 'processing'),
        isNotNull(bookings.checkoutId),
        isNotNull(bookings.paymentDeadline),
        lte(bookings.paymentDeadline, new Date()),
        notInArray(bookings.status, ['completed', 'refunded']),
      ),
      columns: { idempotencyKey: true },
      limit: RECONCILE_LIMIT,
    });

    let settled = 0;
    for (const row of stuck) {
      const outcome = await settleBooking(row.idempotencyKey);
      if (outcome === 'success') settled += 1;
    }

    // Pass 3 — guest reminders. Two hourly-precision reminders over
    // confirmed, email-bearing bookings starting soon: a ~24h "get ready"
    // and a ~3h day-of "see you soon". Each has its own dedupe flag
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
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          inArray(bookings.date, [todayRiyadh, tomorrowRiyadh]),
          isNotNull(guests.email),
          or(isNull(bookings.reminderSentAt), isNull(bookings.finalReminderSentAt)),
        ),
      )
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
      .returning({ id: bookings.id });

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
          netSar: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.paidAt} >= now() - interval '365 days'), 0)::int - coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} = 'refunded' and ${bookings.paidAt} >= now() - interval '365 days'), 0)::int`,
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
      reminded,
      completed: completed.length,
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
