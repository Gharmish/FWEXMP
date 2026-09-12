import 'server-only';

import { db } from '@/lib/db';
import { platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { todayInRiyadh } from '@/features/bookings/lib/availability';
import { MONEY_PASSES, RUN_BUDGET_MS, createPassRunner } from '@/features/maintenance/runner';
import {
  expireRequests,
  releaseHolds,
  sweepRefundOutOrphans,
  sweepStrandedReservations,
  watchOrphanedRefunds,
} from '@/features/maintenance/passes/holds';
import {
  reconcileStuckHolds,
  watchSettlementAging,
} from '@/features/maintenance/passes/settlement';
import {
  expireStaleQueued,
  maskIbansAtRest,
  nudgeUnpaidHolds,
  retryFailedDeliveries,
  sendGuestReminders,
} from '@/features/maintenance/passes/comms';
import { sweepSupportLine } from '@/features/maintenance/passes/support';
import {
  autoCompleteBookings,
  sendPostTripMarketing,
} from '@/features/maintenance/passes/lifecycle';
import {
  expireWalletCredit,
  vatGuards,
  watchNegativeTake,
} from '@/features/maintenance/passes/finance';
import {
  pruneAnalytics,
  pruneThrottleEvents,
  pruneVitals,
  purgeKycDocuments,
} from '@/features/maintenance/passes/retention';

export interface ReleaseHoldsSummary {
  expired: number;
  released: number;
  reconciled: number;
  settled: number;
  anomalies: number;
  reminded: number;
  nudged: number;
  retried: number;
  staleQueuedRequeued: number;
  ibansMasked: number;
  supportSwept: number;
  agentSwept: number;
  slaBreaches: number;
  conversationsPurged: number;
  dailyReportSent: boolean;
  completed: number;
  marketed: number;
  expiredCreditSar: number;
  analyticsPruned: boolean;
  vitalsPruned: boolean;
  kycDocumentsPurged: number;
  failedPasses: string[];
  skippedPasses: string[];
  truncated: boolean;
  heartbeat: boolean;
  elapsedMs: number;
}

/**
 * The hourly maintenance run (2026-09 engineering audit ARCH-01: one
 * 1,400-line route handler became this orchestrator over seven pass
 * modules). Order matters: money passes first, then comms, lifecycle,
 * finance guards and retention — and the heartbeat is withheld when a
 * money pass failed so the watchdog escalates instead of the run looking
 * healthy. See app/api/cron/release-holds/route.ts for the scheduling
 * and auth contract.
 */
export async function runReleaseHolds(): Promise<ReleaseHoldsSummary> {
  const run = createPassRunner(RUN_BUDGET_MS);

  const expired = await expireRequests(run);
  const released = await releaseHolds(run);
  await sweepStrandedReservations(run);
  await watchOrphanedRefunds(run);
  await sweepRefundOutOrphans(run);

  const { reconciled, settled, anomalies } = await reconcileStuckHolds(run);
  await watchSettlementAging(run);

  const reminded = await sendGuestReminders(run);
  const nudged = await nudgeUnpaidHolds(run);
  const retried = await retryFailedDeliveries(run);
  const staleQueuedRequeued = await expireStaleQueued(run);
  const ibansMasked = await maskIbansAtRest(run);
  const support = await sweepSupportLine(run);

  const todayRiyadh = todayInRiyadh();
  const completed = await autoCompleteBookings(run, todayRiyadh);
  const marketed = await sendPostTripMarketing(run, todayRiyadh);

  await vatGuards(run);
  await watchNegativeTake(run);
  const expiredCreditSar = await expireWalletCredit(run);

  await pruneThrottleEvents(run);
  const analyticsPruned = await pruneAnalytics(run);
  const vitalsPruned = await pruneVitals(run);
  const kycDocumentsPurged = await purgeKycDocuments(run);

  const moneyFailed = run.failedPasses.some((name) => MONEY_PASSES.has(name));
  if (!moneyFailed) {
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
  }
  if (run.failedPasses.length > 0) {
    // One page per six hours per failing set — the persisted alert rows
    // and Sentry keep the hourly detail.
    await notifyAdmin(
      'cron_failed',
      {
        job: 'release-holds',
        passes: run.failedPasses.join(', '),
        heartbeat: moneyFailed ? 'withheld' : 'stamped',
      },
      { fingerprint: `release-holds:${run.failedPasses.join(',')}`, quietWindowMs: 6 * 3_600_000 },
    );
  }

  return {
    expired: expired.length,
    released: released.length,
    reconciled,
    settled,
    anomalies,
    reminded,
    nudged,
    retried,
    staleQueuedRequeued,
    ibansMasked,
    ...support,
    completed: completed.length,
    marketed,
    expiredCreditSar,
    analyticsPruned,
    vitalsPruned,
    kycDocumentsPurged,
    failedPasses: run.failedPasses,
    skippedPasses: run.skippedPasses,
    truncated: run.skippedPasses.length > 0,
    heartbeat: !moneyFailed,
    elapsedMs: Date.now() - run.startedAt,
  };
}
