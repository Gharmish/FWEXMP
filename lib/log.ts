import * as Sentry from '@sentry/nextjs';
import { redactString, redactValue } from '@/lib/sentry-scrub';

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

/**
 * Errors logged to the production console must not carry raw PII: with
 * no Sentry DSN the console IS the transport into platform function
 * logs, and callers legitimately pass phone/email in `context` (the
 * Sentry rail scrubs them in `beforeSend`; this rail must match).
 * `Error` instances are flattened to a scrubbed string — recursing
 * their enumerable props would drop message/stack.
 */
function consoleSafe(value: unknown): unknown {
  if (process.env.NODE_ENV !== 'production') return value;
  if (value instanceof Error) {
    return redactString(`${value.stack ?? `${value.name}: ${value.message}`}${causeChain(value)}`);
  }
  return redactValue(value);
}

/**
 * Drizzle wraps every driver failure as `Failed query: <sql>` and keeps
 * the real reason (SQLSTATE, socket error) in `cause`, which the console
 * rail never printed — an invalid-SQL bug in the hourly cron went
 * undiagnosed for six days because the logs only showed the statement.
 */
function causeChain(error: Error): string {
  let out = '';
  let cursor: unknown = error.cause;
  for (let depth = 0; cursor instanceof Error && depth < 4; depth += 1) {
    const code = (cursor as { code?: unknown }).code;
    out += `\n  [cause] ${cursor.name}${typeof code === 'string' ? ` (${code})` : ''}: ${cursor.message}`;
    cursor = cursor.cause;
  }
  return out;
}

export function reportError(error: unknown, context?: ReportErrorContext): void {
  const sentryConfigured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (process.env.NODE_ENV !== 'production' || !sentryConfigured) {
    // Single chokepoint for `console.*` in the app — the rest of the
    // codebase routes through reportError() rather than touching the
    // console directly (CLAUDE.md no-console rule). In production
    // WITHOUT a Sentry DSN this is the only place errors surface
    // (platform function logs) — captureException would enqueue into
    // the void and every failure would vanish unrecorded. Scrubbed in
    // production (dev keeps raw values for debugging).
    console.error(
      '[gharmish]',
      context?.surface ?? 'error',
      consoleSafe(error),
      consoleSafe(context),
    );
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
