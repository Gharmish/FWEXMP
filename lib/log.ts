import * as Sentry from '@sentry/nextjs';

/**
 * Application logger. Single chokepoint so the rest of the codebase
 * never reaches for `console.*` directly (CLAUDE.md ban). Production
 * errors route through Sentry; dev errors go to the local console with
 * a stable `[gharmish]` prefix and a surface label.
 *
 * Sentry is initialised in `instrumentation.ts` (server) and
 * `instrumentation-client.ts` (client). When no DSN is set those
 * inits are no-ops, so calling `Sentry.captureException` here is also
 * safe — it just enqueues nothing.
 */
export interface ReportErrorContext {
  /** Free-form label so the surface is grep-able in logs. */
  surface?: string;
  /** Anything else useful — locale, userId once we have auth, etc. */
  [key: string]: unknown;
}

export function reportError(error: unknown, context?: ReportErrorContext): void {
  const sentryConfigured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (process.env.NODE_ENV !== 'production' || !sentryConfigured) {
    // Single chokepoint for `console.*` in the app — the rest of the
    // codebase routes through reportError() rather than touching the
    // console directly (CLAUDE.md no-console rule). In production
    // WITHOUT a Sentry DSN this is the only place errors surface
    // (platform function logs) — captureException would enqueue into
    // the void and every failure would vanish unrecorded.
    console.error('[gharmish]', context?.surface ?? 'error', error, context);
    if (!sentryConfigured) return;
  }

  // The `surface` field becomes a Sentry tag (queryable in the
  // dashboard); everything else flows through `extra` (visible on the
  // event but not indexed).
  const { surface, ...extra } = context ?? {};
  Sentry.captureException(error, {
    tags: surface ? { surface } : undefined,
    extra,
  });
}
