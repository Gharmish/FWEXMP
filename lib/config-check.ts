import 'server-only';

import { hasHyperpay, serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';

/**
 * Production configuration assertion (2026-09 engineering audit OPS-06).
 *
 * lib/env.ts defaults every variable to '' so the app boots in dev, CI
 * and previews without secrets. In production that same leniency turns a
 * dropped variable into a silent degradation: an empty CRON_SECRET 401s
 * every scheduled run (the literal 2026-07-08 three-week incident), an
 * empty webhook secret leaves settlement riding on the reconcile pass, an
 * empty PII key stores IBANs in plaintext. This lists what production
 * must have and logs it once per process when something is missing.
 * Never throws — a misconfigured site must stay up.
 *
 * Paging (the admin_alerts row + email) moved to the hourly cron
 * (features/maintenance/passes/config.ts): from the cold-start path it
 * cost every new instance two undeadlined round trips to the pooler,
 * which raced the first request's own handshake and filled the runtime
 * logs with CONNECT_TIMEOUT / EAUTHTIMEOUT (2026-09-13 log review).
 */

/**
 * Everything production is known to run on as of 2026-10-17 — the list
 * used to stop at the first secrets (2026-09) and so missed the variables
 * whose absence switches a live feature off without an error (scan
 * HYGIENE-02): `hasHyperpay()` false means every checkout is refused and
 * no booking can be paid; `RESEND_FROM` empty means `hasEmail()` is false
 * and no email goes out; `TWILIO_WHATSAPP_FROM` empty silences every
 * WhatsApp notification and the support agent; the Verify service SID
 * carries phone sign-in and the host phone-change proof; the Anthropic
 * key is the support agent itself; the WhatsApp alert number is the
 * second paging rail. `COOKIE_SIGNING_SECRET` is deliberately NOT here —
 * the cookie key derives from the service-role key when it is unset.
 * `TWILIO_WHATSAPP_CONTENT_SIDS` is checked per template by the config
 * pass rather than as one blob. `HYPERPAY_APPLEPAY_ENTITY_ID` is NOT
 * here either: `hasHyperpayApplePay()` simply hides Apple Pay when it is
 * unset, so a card-only deployment is a choice, not a misconfiguration.
 */
const ALWAYS_REQUIRED = [
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'PII_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TWILIO_VERIFY_SERVICE_SID',
  'ANTHROPIC_API_KEY',
  'HYPERPAY_ACCESS_TOKEN',
  'HYPERPAY_ENTITY_ID',
  'ADMIN_ALERT_EMAIL',
  'ADMIN_ALERT_WHATSAPP',
] as const;

export function missingProductionConfig(
  env: Record<string, string | undefined> = serverEnv as unknown as Record<
    string,
    string | undefined
  >,
  paymentsConfigured: boolean = hasHyperpay(),
): string[] {
  const required: string[] = [...ALWAYS_REQUIRED];
  if (paymentsConfigured) required.push('HYPERPAY_WEBHOOK_SECRET');
  return required.filter((key) => !env[key]);
}

let asserted = false;

export async function assertProductionConfig(): Promise<string[]> {
  if (asserted) return [];
  asserted = true;
  const missing = missingProductionConfig();
  if (missing.length === 0) return [];
  const error = new Error(`Production configuration missing: ${missing.join(', ')}`);
  reportError(error, { surface: 'config-check' });
  return missing;
}
