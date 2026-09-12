import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { runReleaseHolds } from '@/features/maintenance/release-holds';

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
/**
 * Explicit function ceiling (2026-09 engineering audit OPS-04 / PERF-04):
 * the run is 17 sequential passes with per-row provider I/O; without a
 * declared ceiling and an elapsed budget, a slow provider day meant the
 * platform killed the function mid-run — no alert, no heartbeat, and the
 * later passes silently skipped that hour.
 */
export const maxDuration = 300;

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
    // The passes live in features/maintenance (2026-09 engineering audit
    // ARCH-01); this handler owns only scheduling and auth.
    return NextResponse.json(await runReleaseHolds());
  } catch (error) {
    reportError(error, { surface: 'cron-release-holds' });
    await notifyAdmin('cron_failed', {
      job: 'release-holds',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
