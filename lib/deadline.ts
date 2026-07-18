/**
 * Bound a promise with a wall-clock deadline.
 *
 * Exists because postgres-js has NO statement timeout: a query dispatched
 * onto a poisoned pooled connection (half-sent protocol message — seen in
 * production as `active` backends waiting on `ClientRead` for minutes)
 * never settles, and whatever awaits it hangs forever with no error.
 * Racing a deadline converts that silent hang into a thrown
 * `DeadlineError` the caller can retry or degrade on.
 *
 * The abandoned promise is given a no-op catch so its eventual rejection
 * (if the connection ever dies) never surfaces as an unhandled rejection.
 * NOTE: abandoning a query does NOT free its pool slot — the connection
 * stays occupied until the pool recycles it — so callers should retry at
 * most once and then degrade, not loop.
 */
import { reportError } from '@/lib/log';

export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded ${ms}ms deadline`);
    this.name = 'DeadlineError';
  }
}

export async function withDeadline<T>(label: string, ms: number, promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Per-statement budget for public render paths (matches the admin waves). */
const QUERY_DEADLINE_MS = 8_000;

/**
 * Bound one DB read with a deadline, retrying ONCE on timeout.
 *
 * The public-page counterpart of the admin dashboard's `wave()`: without
 * it, a statement queued onto a poisoned pooled connection hangs the RSC
 * render until Vercel's function timeout (seen in production as 300s
 * hangs on the experience-detail and booking-confirmation pages — the
 * per-query catch/degrade paths never fire because a hang never
 * rejects). The retry re-issues a fresh statement, which the pool queues
 * onto a healthy slot; after that the error propagates to the caller's
 * existing degrade-or-throw handling.
 *
 * `run` must build a NEW query each call — passing a started promise
 * would make the retry await the same hung socket. `Promise.resolve`
 * upgrades Drizzle's thenable query builders to real promises.
 */
export async function boundedQuery<T>(
  label: string,
  run: () => Promise<T> | PromiseLike<T>,
): Promise<T> {
  try {
    return await withDeadline(label, QUERY_DEADLINE_MS, Promise.resolve(run()));
  } catch (error) {
    if (!(error instanceof DeadlineError)) throw error;
    reportError(error, { surface: 'db:boundedQueryRetry', label });
    return await withDeadline(`${label}:retry`, QUERY_DEADLINE_MS, Promise.resolve(run()));
  }
}
