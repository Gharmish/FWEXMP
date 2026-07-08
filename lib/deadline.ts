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
