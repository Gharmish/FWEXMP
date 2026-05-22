import * as Sentry from '@sentry/nextjs';

/**
 * Browser-side Sentry init (Next 15+ convention). Imported once per
 * client bundle. When NEXT_PUBLIC_SENTRY_DSN is unset the init is a
 * no-op — no transport, no event buffering.
 *
 * Kept deliberately minimal: no replay, no profiling, no breadcrumb
 * tweaks. Production tuning happens in a follow-up once we have a real
 * DSN and traffic to calibrate against.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  tracesSampleRate: 0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

/** Wires Next's router-transition navigation timing into Sentry tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
