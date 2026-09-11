import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: '' }, hasSupportAgent: () => false }));
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
    await expect(
      recordInboundMessage({ from: 'whatsapp:+966541104000', body: 'hi' }),
    ).resolves.toBeNull();
  });
});

describe('ACK_COPY', () => {
  it('uses the alef spelling of the brand name', () => {
    expect(ACK_COPY.ar).toContain('غارميش');
    expect(ACK_COPY.ar).not.toContain('غرميش');
  });
});
