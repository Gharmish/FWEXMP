import 'server-only';

import { notifyAdmin } from '@/lib/admin-alerts';
import { missingProductionConfig } from '@/lib/config-check';
import type { PassRunner } from '@/features/maintenance/runner';

/** The quiet window between two pages for the same missing variables. */
export const CONFIG_ALERT_QUIET_MS = 6 * 3_600_000;

/**
 * Pass 0 — production configuration watch (2026-09 engineering audit
 * OPS-06, moved here from the cold-start path on 2026-09-13). Pages the
 * team — one admin_alerts row + email, deduped for six hours — while a
 * variable production must have is missing. Running it from the cron
 * keeps the boot path free of database round trips: from
 * instrumentation.ts every new Vercel instance raced its first request's
 * handshake and left CONNECT_TIMEOUT noise in the logs.
 */
export async function watchProductionConfig(run: PassRunner) {
  await run.pass(
    '0-config-check',
    async () => {
      // Only production carries the real secrets; previews and CI boot
      // with lib/env.ts defaults on purpose.
      if (process.env.VERCEL_ENV !== 'production') return;
      const missing = missingProductionConfig();
      if (missing.length === 0) return;
      await notifyAdmin(
        'config_missing',
        { missing: missing.join(', '), count: missing.length },
        { fingerprint: 'config-check', quietWindowMs: CONFIG_ALERT_QUIET_MS },
      );
    },
    undefined,
    { bestEffort: true },
  );
}
