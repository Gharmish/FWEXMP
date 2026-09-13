import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ serverEnv: {}, hasHyperpay: () => false }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

import { missingProductionConfig } from './config-check';

const full = {
  DATABASE_URL: 'postgres://x',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  CRON_SECRET: 's',
  PII_ENCRYPTION_KEY: 'p',
  RESEND_API_KEY: 'r',
  TWILIO_ACCOUNT_SID: 'a',
  TWILIO_AUTH_TOKEN: 't',
  ADMIN_ALERT_EMAIL: 'ops@example.com',
  HYPERPAY_WEBHOOK_SECRET: 'w',
};

describe('missingProductionConfig', () => {
  it('is empty when everything production needs is present', () => {
    expect(missingProductionConfig(full, true)).toEqual([]);
  });

  it('names each missing secret', () => {
    expect(
      missingProductionConfig({ ...full, CRON_SECRET: '', PII_ENCRYPTION_KEY: undefined }, true),
    ).toEqual(['CRON_SECRET', 'PII_ENCRYPTION_KEY']);
  });

  it('requires the webhook secret only when payments are configured', () => {
    const env = { ...full, HYPERPAY_WEBHOOK_SECRET: '' };
    expect(missingProductionConfig(env, false)).toEqual([]);
    expect(missingProductionConfig(env, true)).toEqual(['HYPERPAY_WEBHOOK_SECRET']);
  });
});
