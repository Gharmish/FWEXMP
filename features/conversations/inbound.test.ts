import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const env = vi.hoisted(() => ({ DATABASE_URL: '' }));
const dbFake = vi.hoisted(() => ({
  query: {
    conversations: {
      findFirst: async (): Promise<unknown> => {
        throw new Error('connection reset');
      },
    },
  },
}));
vi.mock('@/lib/db', () => ({ db: dbFake }));
vi.mock('@/lib/env', () => ({ serverEnv: env, hasSupportAgent: () => false }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/lib/notifications/ledger', () => ({
  claimDelivery: vi.fn(),
  markDeliveryFailed: vi.fn(),
  markDeliverySent: vi.fn(),
}));
vi.mock('@/lib/notifications/whatsapp/provider', () => ({
  sendWhatsAppText: vi.fn(),
  whatsappAddress: vi.fn(),
}));

import { ACK_COPY, canonicalPhone, inferLocale, recordInboundMessage } from './inbound';

describe('canonicalPhone', () => {
  it('strips the whatsapp: prefix and formatting', () => {
    expect(canonicalPhone('whatsapp:+966 54 110 4000')).toBe('+966541104000');
  });
  it('rejects non-dialable input', () => {
    expect(canonicalPhone('whatsapp:123')).toBeNull();
  });
});

describe('inferLocale', () => {
  it('is Arabic for Arabic script', () => {
    expect(inferLocale('متى نلتقي؟')).toBe('ar');
  });
  it('is English for Latin text', () => {
    expect(inferLocale('What time do we meet?')).toBe('en');
  });
  it('defaults to Arabic for digits/emoji only', () => {
    expect(inferLocale('👍 2')).toBe('ar');
  });
});

describe('recordInboundMessage', () => {
  it('is a no-op without a database', async () => {
    env.DATABASE_URL = '';
    await expect(
      recordInboundMessage({ from: 'whatsapp:+966541104000', body: 'hi' }),
    ).resolves.toBeNull();
  });

  it('rethrows a database failure so the webhook refuses the delivery and Twilio retries', async () => {
    // The catch used to return null, which the webhook ACKed with 200:
    // Twilio never redelivered and the guest's message was gone.
    env.DATABASE_URL = 'postgres://test';
    try {
      await expect(
        recordInboundMessage({ from: 'whatsapp:+966541104000', body: 'hi' }),
      ).rejects.toThrow('connection reset');
    } finally {
      env.DATABASE_URL = '';
    }
  });
});

describe('ACK_COPY', () => {
  it('uses the alef spelling of the brand name', () => {
    expect(ACK_COPY.ar).toContain('غارميش');
    expect(ACK_COPY.ar).not.toContain('غرميش');
  });
});
