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

const ALWAYS_REQUIRED = [
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'PII_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'ADMIN_ALERT_EMAIL',
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
