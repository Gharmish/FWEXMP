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
import { getDbGeneration, resetDb } from '@/lib/db';
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

/**
 * Per-attempt budgets for public render paths. Every app statement runs
 * in <50ms server-side (pg_stat_statements, 2026-08-21), so a first
 * attempt past 5s is a dead socket, not a slow query — waiting the full
 * 8s only delays the retry. The retry runs on a fresh pool and gets the
 * admin waves' 8s so a cold Supavisor tenant pool has room to spin up.
 */
const FIRST_ATTEMPT_MS = 5_000;
const RETRY_ATTEMPT_MS = 8_000;

/** postgres.js / Node / SQLSTATE codes that mean "the socket, not the SQL". */
const TRANSIENT_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAUTHTIMEOUT',
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure (Supavisor's EAUTHTIMEOUT arrives as this)
  '08P01', // protocol_violation
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

/**
 * True for failures caused by the connection rather than the statement:
 * a reissued query on a healthy socket would succeed, so they are worth
 * one retry. Walks `cause` because Drizzle wraps driver errors in
 * `DrizzleQueryError` and postgres.js nests socket errors the same way.
 */
export function isTransientConnectionError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > 4) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  if (/EAUTHTIMEOUT|ETIMEDOUT|ECONNRESET|CONNECT_TIMEOUT|CONNECTION_CLOSED/.test(error.message)) {
    return true;
  }
  return isTransientConnectionError((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Bound one DB read with a deadline, retrying ONCE on timeout or on a
 * transient connection failure.
 *
 * The public-page counterpart of the admin dashboard's `wave()`: without
 * it, a statement queued onto a poisoned pooled connection hangs the RSC
 * render until Vercel's function timeout (seen in production as 300s
 * hangs on the experience-detail and booking-confirmation pages — the
 * per-query catch/degrade paths never fire because a hang never
 * rejects).
 *
 * On a hang the shared pool is REPLACED before the retry (`resetDb`):
 * the hung statement never releases its slot, and an instance whose
 * five slots have all hung can only keep hanging (2026-08-21 incident —
 * bursts of every detail-page query timing out for one visitor, with
 * sub-millisecond server-side execution). The retry therefore always
 * runs on fresh sockets; after that the error propagates to the caller's
 * existing degrade-or-throw handling.
 *
 * Connection errors (`ETIMEDOUT`, Supavisor `EAUTHTIMEOUT`, …) already
 * close their socket inside postgres.js, so they are retried without a
 * reset. Real SQL errors propagate immediately — never retried.
 *
 * `run` must build a NEW query each call — passing a started promise
 * would make the retry await the same hung socket. `Promise.resolve`
 * upgrades Drizzle's thenable query builders to real promises.
 */
export async function boundedQuery<T>(
  label: string,
  run: () => Promise<T> | PromiseLike<T>,
): Promise<T> {
  const generation = getDbGeneration();
  try {
    return await withDeadline(label, FIRST_ATTEMPT_MS, Promise.resolve(run()));
  } catch (error) {
    const hung = error instanceof DeadlineError;
    if (!hung && !isTransientConnectionError(error)) throw error;
    const reset = hung ? resetDb(generation) : false;
    reportError(error, { surface: 'db:boundedQueryRetry', label, poolReset: reset });
    return await withDeadline(`${label}:retry`, RETRY_ATTEMPT_MS, Promise.resolve(run()));
  }
}
