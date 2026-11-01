import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasSupportAgent: () => false,
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/lib/notifications/ledger', () => ({
  claimDelivery: async () => ({ claimed: true, id: 'delivery-1' }),
  markDeliveryFailed: vi.fn(),
  markDeliverySent: vi.fn(),
}));
const send = vi.hoisted(() => ({
  result: { ok: true, sid: 'SM1' } as { ok: true; sid: string } | { ok: false; error: string },
}));
vi.mock('@/lib/notifications/whatsapp/provider', () => ({
  sendWhatsAppText: async () => send.result,
  whatsappAddress: (address: string) => `whatsapp:${address}`,
}));
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: async () => undefined }));
vi.mock('@/lib/notifications/whatsapp', () => ({
  SUPPORT_SESSION_COPY: { ack: { ar: 'ack', en: 'ack' } },
  whatsappPayload: () => ({ templateId: 't', vars: {} }),
}));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { sendConversationReply, sendSupportTemplate } from './inbound';

const reply = (type: 'support_ack' | 'support_reply') => ({
  conversationId: 'conv-1',
  address: '+966500000000',
  body: 'Hello',
  author: 'system' as const,
  type,
  locale: 'ar' as const,
  dedupeKey: `${type}:msg-1`,
});

beforeEach(() => {
  fake.current = createDbFake({ insert: () => [{ id: 'out-1' }] });
});

describe('sendConversationReply timestamps', () => {
  it('stamps lastOutboundAt and lastAckAt when the provider accepts the ack', async () => {
    send.result = { ok: true, sid: 'SM1' };
    const result = await sendConversationReply(reply('support_ack'));
    expect(result.ok).toBe(true);
    expect(fake.current?.updates).toHaveLength(1);
    expect(fake.current?.updates[0]).toHaveProperty('lastOutboundAt');
    expect(fake.current?.updates[0]).toHaveProperty('lastAckAt');
  });

  it('records a failed send in the transcript without marking the thread answered', async () => {
    send.result = { ok: false, error: 'twilio 503' };
    const result = await sendConversationReply(reply('support_reply'));
    expect(result).toEqual({ ok: false, error: 'twilio 503' });
    expect(fake.current?.inserts).toHaveLength(1);
    expect(fake.current?.updates).toHaveLength(0);
  });

  it('leaves the ack throttle open when the ack fails', async () => {
    send.result = { ok: false, error: 'timeout' };
    await sendConversationReply(reply('support_ack'));
    expect(fake.current?.updates).toHaveLength(0);
  });
});

describe('sendSupportTemplate transcript attribution (#112)', () => {
  const template = {
    conversationId: 'conv-1',
    address: '+966500000000',
    locale: 'ar' as const,
    type: 'support_ticket_resolved',
    templateId: 'support_ticket_resolved',
    vars: { ticketReference: 'TK-1' },
    dedupeKey: 'support_ticket_resolved:t1',
    transcript: '[template support_ticket_resolved · TK-1]',
  };

  it('writes the transcript row as an admin reply by default', async () => {
    expect(await sendSupportTemplate(template)).toEqual({ ok: true });
    expect(fake.current?.inserts[0]).toMatchObject({ direction: 'out', author: 'admin' });
  });

  it('writes a system notice when asked, so it does not count as a reply', async () => {
    await sendSupportTemplate({ ...template, author: 'system' });
    expect(fake.current?.inserts[0]).toMatchObject({ direction: 'out', author: 'system' });
  });
});
