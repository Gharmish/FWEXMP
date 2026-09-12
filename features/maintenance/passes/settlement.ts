import 'server-only';

import { and, asc, eq, inArray, isNull, isNotNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { settleBooking } from '@/features/payments/settle';
import { sendBookingReceiptEmail } from '@/features/bookings/lib/booking-email';
import type { PassRunner } from '@/features/maintenance/runner';
import { RECONCILE_LIMIT } from '@/features/maintenance/runner';

/**
 * Money stuck at the gateway: re-settle `processing` rows against HyperPay
 * and alert on the ones the reconcile predicate structurally cannot see.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function reconcileStuckHolds(run: PassRunner) {
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
  // writers stamp `checkoutSupersededAt` instead — the `checkoutId`
  // itself is deliberately KEPT (never nulled, 2026-07-28 fourth
  // audit) so a late capture on the old checkout stays resolvable by
  // settle/webhook; the supersession stamp is what stops the cron
  // from chasing it. (Comment corrected 2026-08-01 — it previously
  // claimed the id was cleared, which no writer does.)
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
  const { reconciled, settled, anomalies } = await run.pass(
    '2-reconcile',
    async () => {
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
        // Anomaly-stamped rows sort LAST (2026-08-01 ninth audit): an
        // unresolved anomaly stays `processing` until an admin acts, so
        // sorted by age alone a handful of them permanently occupied the
        // head of the bounded window, burning a gateway round-trip each
        // per hour and eventually starving genuinely-stuck rows out of
        // the scan. They stay IN the scan — a settle retry can still
        // clear a transient anomaly — just behind rows that can actually
        // make progress. Then oldest deadline first, so the pass works on
        // the longest-stuck money rather than re-scanning the same head.
        orderBy: (b, { asc }) => [sql`(${b.settleAnomalyAt} is not null)`, asc(b.paymentDeadline)],
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
      return { reconciled: stuck.length, settled, anomalies };
    },
    { reconciled: 0, settled: 0, anomalies: 0 },
  );
  return { reconciled, settled, anomalies };
}

export async function watchSettlementAging(run: PassRunner) {
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
  await run.pass(
    '2b-settle-aging',
    async () => {
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
    },
    undefined,
  );
}
