import 'server-only';

import { reportError } from '@/lib/log';

/** Cap reconciliation work per run so a backlog can't blow the function budget. */
export const RECONCILE_LIMIT = 100;
/** Cap reminder sends per run for the same reason. */
export const REMINDER_LIMIT = 100;
/** Cap notification retries per run for the same reason. */
export const RETRY_LIMIT = 50;
/**
 * How long rejected applicants' KYC documents are kept before the
 * retention pass deletes them (2026-08-02 legal audit): long enough to
 * answer a complaint or a re-application question, short enough to
 * honour the privacy policy's "data with no remaining purpose is deleted".
 */
export const KYC_RETENTION_DAYS = 90;
/**
 * Cap auto-completions per run: each one fans out completion emails. The
 * remainder completes on the next hourly run — bounded delay, never a
 * dropped notification.
 */
export const COMPLETION_LIMIT = 25;

/** Wall-clock budget after which best-effort comms passes are skipped, not started. */
export const RUN_BUDGET_MS = 240_000;

/** Passes whose failure must withhold the heartbeat so the watchdog escalates. */
export const MONEY_PASSES: ReadonlySet<string> = new Set([
  '0-expire-requests',
  '1-release-holds',
  '1b-stranded-reservations',
  '1c-orphaned-refunds',
  '1d-refund-out-sweep',
  '2-reconcile',
  '2b-settle-aging',
]);

export interface PassRunner {
  /**
   * Run one named pass in isolation: a throw is reported with the pass
   * name, recorded in `failedPasses`, and replaced by `fallback` so the
   * later passes still run. Best-effort passes are skipped (not started)
   * once the run is over budget.
   */
  pass<T>(
    name: string,
    fn: () => Promise<T>,
    fallback: T,
    opts?: { bestEffort?: boolean },
  ): Promise<T>;
  readonly failedPasses: string[];
  readonly skippedPasses: string[];
  /** Passes that stopped early because the run budget ran out mid-loop. */
  readonly truncatedPasses: string[];
  readonly startedAt: number;
  /** True once the run has used its budget — long loops check this per item. */
  overBudget(): boolean;
  /** Record that `name` stopped early; the pass still returns its partial result. */
  truncate(name: string): void;
}

/**
 * Per-pass isolation (2026-09 engineering audit OPS-03 / PERF-04). Eleven
 * passes used to run bare inside one try, so one bad row in the support
 * sweep aborted auto-complete, marketing, VAT guards and the heartbeat
 * for every later hour until a code fix shipped.
 */
export function createPassRunner(budgetMs: number = RUN_BUDGET_MS): PassRunner {
  const startedAt = Date.now();
  const failedPasses: string[] = [];
  const skippedPasses: string[] = [];
  const truncatedPasses: string[] = [];
  const overBudget = (): boolean => Date.now() - startedAt > budgetMs;
  return {
    startedAt,
    failedPasses,
    skippedPasses,
    truncatedPasses,
    overBudget,
    truncate(name) {
      if (!truncatedPasses.includes(name)) truncatedPasses.push(name);
    },
    async pass(name, fn, fallback, opts = {}) {
      if (opts.bestEffort && overBudget()) {
        skippedPasses.push(name);
        return fallback;
      }
      try {
        return await fn();
      } catch (error) {
        reportError(error, { surface: 'cron-release-holds', pass: name });
        failedPasses.push(name);
        return fallback;
      }
    },
  };
}
