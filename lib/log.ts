/**
 * Application logger. Single chokepoint so the rest of the codebase
 * never reaches for `console.*` directly (CLAUDE.md ban) — and so when
 * we wire Sentry (BRIEF §5 monitoring) it lands in one file.
 *
 * In development we want the error in the terminal / browser console;
 * in production this is a no-op until the Sentry SDK is installed and
 * `reportError` forwards to `Sentry.captureException`.
 */
export interface ReportErrorContext {
  /** Free-form label so the surface is grep-able in logs. */
  surface?: string;
  /** Anything else useful — locale, userId once we have auth, etc. */
  [key: string]: unknown;
}

export function reportError(error: unknown, context?: ReportErrorContext): void {
  if (process.env.NODE_ENV !== 'production') {
    // Single chokepoint for `console.*` in the app — the rest of the
    // codebase routes through reportError() rather than touching the
    // console directly (CLAUDE.md no-console rule).
    console.error('[gharmish]', context?.surface ?? 'error', error, context);
    return;
  }
  // TODO(sentry): forward to Sentry.captureException(error, { extra: context }).
}
