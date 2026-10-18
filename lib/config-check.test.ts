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
  RESEND_FROM: 'Gharmish <hello@example.com>',
  TWILIO_ACCOUNT_SID: 'a',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+966500000000',
  TWILIO_VERIFY_SERVICE_SID: 'VA1',
  ANTHROPIC_API_KEY: 'sk',
  HYPERPAY_ACCESS_TOKEN: 'h',
  HYPERPAY_ENTITY_ID: 'e',
  HYPERPAY_APPLEPAY_ENTITY_ID: 'ap',
  ADMIN_ALERT_EMAIL: 'ops@example.com',
  ADMIN_ALERT_WHATSAPP: '+966500000001',
  HYPERPAY_WEBHOOK_SECRET: 'w',
};

describe('missingProductionConfig', () => {
  it('is empty when everything production needs is present', () => {
    expect(missingProductionConfig(full, true)).toEqual([]);
  });

  it('names the variables whose absence silently switches a live feature off (HYGIENE-02)', () => {
    expect(
      missingProductionConfig(
        {
          ...full,
          HYPERPAY_ACCESS_TOKEN: '',
          RESEND_FROM: '',
          TWILIO_WHATSAPP_FROM: '',
          TWILIO_VERIFY_SERVICE_SID: '',
          ANTHROPIC_API_KEY: '',
          ADMIN_ALERT_WHATSAPP: '',
        },
        true,
      ),
    ).toEqual([
      'RESEND_FROM',
      'TWILIO_WHATSAPP_FROM',
      'TWILIO_VERIFY_SERVICE_SID',
      'ANTHROPIC_API_KEY',
      'HYPERPAY_ACCESS_TOKEN',
      'ADMIN_ALERT_WHATSAPP',
    ]);
  });

  it('does not demand the optional cookie-signing secret (it derives from the service key)', () => {
    expect(missingProductionConfig({ ...full, COOKIE_SIGNING_SECRET: '' }, true)).toEqual([]);
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
