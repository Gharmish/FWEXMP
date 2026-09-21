import 'server-only';

import { hasHyperpay } from '@/lib/env';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { gatewayChannels, queryPaymentsByReference } from '@/features/payments/lib/hyperpay';
import type { PassRunner } from '@/features/maintenance/runner';

/**
 * A well-formed reference no booking carries: `bookings.idempotency_key`
 * is a random v4 UUID, so the all-zero one never collides with a real row.
 */
export const REPORT_PROBE_REFERENCE = '00000000-0000-4000-8000-000000000000';

/**
 * MUST equal the fingerprint settle pages with when it cannot read the
 * report (features/payments/settle.ts), so this check and a real expired
 * checkout collapse into one page a day. report-check.test.ts pins both.
 */
export const REPORT_UNAVAILABLE_FINGERPRINT = 'settle-report-unavailable';
export const REPORT_ALERT_QUIET_MS = 24 * 3_600_000;

/**
 * Pass 0b — transaction-report self-check (2026-09-21). Settle fails
 * CLOSED when `GET /v1/query` cannot be read: an expired checkout stays
 * `processing` and a returning guest cannot get a new one. That endpoint
 * was only ever proven against the TEST entity, and without this pass the
 * first sign of a live entity refusing it is a real guest being blocked.
 * So ask every entity about a reference that matches nothing, once an
 * hour: the healthy answer is "cannot find transaction" (`[]`), anything
 * thrown means settle would fail the same way. One GET per entity, no
 * retries — the next hourly run is the retry.
 */
export async function watchTransactionReport(run: PassRunner) {
  await run.pass(
    '0b-report-check',
    async () => {
      // Only production holds the live credentials this exists to prove.
      if (process.env.VERCEL_ENV !== 'production') return;
      if (!hasHyperpay()) return;

      const unreadable: string[] = [];
      let answer = '';
      for (const channel of gatewayChannels('card')) {
        try {
          await queryPaymentsByReference(REPORT_PROBE_REFERENCE, channel);
        } catch (error) {
          reportError(error, { surface: 'cron-release-holds:report-check', channel });
          unreadable.push(channel);
          if (!answer) answer = error instanceof Error ? error.message : 'unknown error';
        }
      }
      if (unreadable.length === 0) return;

      await notifyAdmin(
        'settle_anomaly',
        {
          problem:
            'the hourly self-check could not read the HyperPay transaction report — expired checkouts will park in processing and returning guests cannot get a new checkout',
          entity: unreadable.join(', '),
          gatewayAnswer: answer,
          action:
            'ask HyperPay to enable Transaction Reports (GET /v1/query) for this entity; a timeout or 5xx answer is a gateway blip and the check repeats hourly',
        },
        { fingerprint: REPORT_UNAVAILABLE_FINGERPRINT, quietWindowMs: REPORT_ALERT_QUIET_MS },
      );
    },
    undefined,
    { bestEffort: true },
  );
}
