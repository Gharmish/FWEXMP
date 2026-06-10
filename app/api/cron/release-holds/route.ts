import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull, isNotNull, lte, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { settleBooking } from '@/features/payments/settle';
import { sendBookingReminderEmail } from '@/features/bookings/lib/booking-email';
import { addDays } from '@/features/bookings/lib/availability';

/** Cap reconciliation work per run so a backlog can't blow the function budget. */
const RECONCILE_LIMIT = 100;

/** Cap reminder sends per run for the same reason. */
const REMINDER_LIMIT = 100;

/**
 * Scheduled release of expired payment holds (Vercel Cron — see vercel.json;
 * runs daily on the Hobby plan, which caps crons at once/day — tighten to a
 * sub-daily schedule on Pro, or trigger this endpoint from an external
 * scheduler).
 *
 * Two passes:
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
    const released = await db
      .update(bookings)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(bookings.paymentStatus, 'unpaid'),
          isNotNull(bookings.paymentDeadline),
          lte(bookings.paymentDeadline, new Date()),
          notInArray(bookings.status, ['cancelled', 'completed', 'refunded']),
        ),
      )
      .returning({ id: bookings.id });

    // Pass 2 — reconcile stuck `processing` holds against HyperPay. Only
    // those whose hold window has elapsed, so a shopper still mid-3DS is
    // never disturbed; `settleBooking` is idempotent and safe to re-run.
    const stuck = await db.query.bookings.findMany({
      where: and(
        eq(bookings.paymentStatus, 'processing'),
        isNotNull(bookings.checkoutId),
        isNotNull(bookings.paymentDeadline),
        lte(bookings.paymentDeadline, new Date()),
        notInArray(bookings.status, ['cancelled', 'completed', 'refunded']),
      ),
      columns: { idempotencyKey: true },
      limit: RECONCILE_LIMIT,
    });

    let settled = 0;
    for (const row of stuck) {
      const outcome = await settleBooking(row.idempotencyKey);
      if (outcome === 'success') settled += 1;
    }

    // Pass 3 — day-before reminders. Confirmed bookings happening
    // tomorrow (Riyadh day) whose guest has an email and hasn't been
    // reminded. `reminderSentAt` is stamped per booking so a re-run in
    // the same day (manual trigger, retry) never double-sends.
    const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
      new Date(),
    );
    const tomorrow = addDays(todayRiyadh, 1);
    const dueReminders = await db
      .select({
        id: bookings.id,
        reference: bookings.idempotencyKey,
        preferredLanguage: guests.preferredLanguage,
      })
      .from(bookings)
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          eq(bookings.date, tomorrow),
          isNull(bookings.reminderSentAt),
          isNotNull(guests.email),
        ),
      )
      .limit(REMINDER_LIMIT);

    let reminded = 0;
    for (const row of dueReminders) {
      try {
        await sendBookingReminderEmail(row.reference, row.preferredLanguage);
        await db
          .update(bookings)
          .set({ reminderSentAt: new Date() })
          .where(eq(bookings.id, row.id));
        reminded += 1;
      } catch (error) {
        reportError(error, { surface: 'cron-reminders', reference: row.reference });
      }
    }

    return NextResponse.json({
      released: released.length,
      reconciled: stuck.length,
      settled,
      reminded,
    });
  } catch (error) {
    reportError(error, { surface: 'cron-release-holds' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
