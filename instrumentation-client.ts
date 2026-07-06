import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

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
  // Never attach default PII (IP, cookies); scrub free-text fields
  // (BRIEF §6 — PII masking at the Sentry boundary).
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});

/** Wires Next's router-transition navigation timing into Sentry tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
