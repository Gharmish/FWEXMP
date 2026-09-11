import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

/**
 * Next.js instrumentation hook (Next 13+). Runs once per server process
 * before the first request — the right spot to initialise Sentry on the
 * Node and Edge runtimes.
 *
 * When SENTRY_DSN is unset the init call below is a no-op (the SDK
 * never opens a transport, never enqueues events). That keeps the file
 * harmless in dev and on previews without a DSN.
 *
 * The matching browser-side init lives in `instrumentation-client.ts`.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.VERCEL_ENV === 'production') {
    // Every secret in lib/env.ts defaults to '' so previews and CI boot
    // without config — which also means a dropped production variable
    // silently degrades a feature instead of paging anyone (2026-09
    // engineering audit OPS-06). Report the gaps once per process; never
    // throw — a misconfigured site must stay up.
    void import('@/lib/config-check')
      .then((m) => m.assertProductionConfig())
      .catch(() => undefined);
  }
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN ?? '',
      // Previews run NODE_ENV=production too; without these two fields their
      // errors land in the same untagged stream as prod and nothing ties a
      // regression to a deploy (2026-09 engineering audit OPS-05).
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: 0,
      // Don't send any breadcrumbs / events when there's no DSN — the
      // SDK already skips network IO but this stops the per-request
      // breadcrumb buffer from filling memory on hot paths.
      enabled: Boolean(process.env.SENTRY_DSN),
      // Never attach default PII (IP, cookies, headers); scrub the rest
      // (BRIEF §6 — PII masking at the Sentry boundary).
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
  }
}

/** Forwards uncaught request errors into Sentry (Next 15+ hook). */
export const onRequestError = Sentry.captureRequestError;
