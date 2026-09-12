import 'server-only';

import { and, eq, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, platformSettings, walletLedger } from '@/db/schema';
import { notifyAdmin } from '@/lib/admin-alerts';
import { platformTakeExpr, rolling12mTurnoverExpr } from '@/features/bookings/lib/payout-sql';
import {
  VAT_MANDATORY_THRESHOLD_SAR,
  VAT_THRESHOLD_ALERT_RATIO,
} from '@/features/admin/vat/thresholds';
import type { PassRunner } from '@/features/maintenance/runner';
import { RECONCILE_LIMIT } from '@/features/maintenance/runner';

/**
 * Finance guards: VAT stamp integrity and registration threshold,
 * negative-take watch, and the wallet credit expiry sweep.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function vatGuards(run: PassRunner) {
  // Pass 5 — VAT accounting guards (daily, best-effort; failures are
  // logged but never block the operational passes above).
  await run.pass(
    '5-vat-guards',
    async () => {
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
    },
    undefined,
  );
}

export async function watchNegativeTake(run: PassRunner) {
  // Pass 5c — negative-take watch (2026-07-20 audit). Platform-funded
  // promo + wallet credit stack with no floor BY DESIGN (owner-
  // arbitrated model), so the guardrail is observability, not a block:
  // alert when payments settled in the last 24h carried a negative
  // platform take (payout to the host exceeds the money collected), so
  // a farmed code or an over-generous stack is seen the day it starts,
  // not at month-end.
  await run.pass(
    '5c-negative-take',
    async () => {
      // ONE shared expression with the dashboard net-revenue KPI
      // (2026-08-01 ninth audit — this was a hand-typed copy).
      const take = platformTakeExpr();
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
    },
    undefined,
  );
}

export async function expireWalletCredit(run: PassRunner) {
  // Pass 6 — wallet credit expiry sweep (2026-07-20 audit: `expiresAt`
  // was recorded but never enforced, so "expiring" goodwill was an
  // unbounded liability that stayed spendable forever). For each
  // expired positive lot without an `expiry:<lotId>` reversal, debit
  // min(current balance, lot amount) under the guest's advisory lock —
  // the balance floor means a lot that was already spent expires as 0
  // (skipped; the 30-day lookback stops eternal re-scans of dead
  // lots, and deliberately avoids expiring NEW credit issued long
  // after the old lot lapsed).
  //
  // Refund-credit protection (2026-08-01 ninth audit): the balance is
  // a fungible SUM, so a plain balance floor let an expiring goodwill
  // lot consume `refund_credit` — the guest's own captured money,
  // which the schema promises never expires and which the refund-out
  // source cap still counts as available. The sweep therefore floors
  // each expiry at the balance MINUS the guest's protected remainder
  // (lifetime refund credits not yet moved back to card). Checkout
  // spending is thereby attributed to expiring credit first — the
  // conservative reading for the guest and the same aggregates the
  // refund-out source cap uses.
  let expiredCreditSar = 0;
  await run.pass(
    '6-wallet-expiry',
    async () => {
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
            .select({
              balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int`,
              // Same aggregates as the refund-out source cap
              // (refund-out-actions.ts): what the guest's own captured
              // money still amounts to, account-wide.
              refundCredits: sql<number>`coalesce(sum(${walletLedger.amountSar}) filter (where ${walletLedger.type} = 'refund_credit'), 0)::int`,
              refundOuts: sql<number>`coalesce(sum(-${walletLedger.amountSar}) filter (where ${walletLedger.type} = 'reversal' and ${walletLedger.idempotencyKey} like 'refund-out:%'), 0)::int`,
            })
            .from(walletLedger)
            .where(eq(walletLedger.guestId, lot.guestId));
          const balance = row?.balance ?? 0;
          const protectedSar = Math.max(0, (row?.refundCredits ?? 0) - (row?.refundOuts ?? 0));
          const expire = Math.min(Math.max(0, balance - protectedSar), lot.amountSar);
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
    },
    undefined,
  );
  return expiredCreditSar;
}
