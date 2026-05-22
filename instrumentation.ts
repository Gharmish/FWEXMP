import * as Sentry from '@sentry/nextjs';

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
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN ?? '',
      tracesSampleRate: 0,
      // Don't send any breadcrumbs / events when there's no DSN — the
      // SDK already skips network IO but this stops the per-request
      // breadcrumb buffer from filling memory on hot paths.
      enabled: Boolean(process.env.SENTRY_DSN),
    });
  }
}

/** Forwards uncaught request errors into Sentry (Next 15+ hook). */
export const onRequestError = Sentry.captureRequestError;
