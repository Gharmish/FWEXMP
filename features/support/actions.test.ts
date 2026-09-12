import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let guard: { reason: string } | null = null;
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  adminGuard: async () => guard,
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const env = vi.hoisted(() => ({ whatsapp: true }));
vi.mock('@/lib/env', () => ({ hasWhatsApp: () => env.whatsapp }));
const sid = vi.hoisted(() => ({ value: 'HX123' as string | null }));
vi.mock('@/lib/notifications/whatsapp/provider', () => ({ whatsappContentSid: () => sid.value }));
vi.mock('@/lib/notifications/whatsapp', () => ({
  renderWhatsApp: () => ({ ok: true, message: { template: 'support_ticket_update' } }),
  SUPPORT_SESSION_COPY: {
    ticketResolved: { en: (ref: string) => `Resolved ${ref}`, ar: (ref: string) => `تم ${ref}` },
  },
}));
const reply = vi.fn<(input: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
const template = vi.fn<(input: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock('@/features/conversations/inbound', () => ({
  sendConversationReply: (input: unknown) => reply(input),
  sendSupportTemplate: (input: unknown) => template(input),
  SERVICE_WINDOW_MS: 24 * 3_600_000,
}));
const openTicket = vi.fn(async () => ({ id: 't-new', reference: 'TK-NEW001' }));
vi.mock('@/features/support/tickets', () => ({ openTicket: () => openTicket() }));

type Row = Record<string, unknown>;
let conversation: Row | undefined;
let ticket: Row | undefined;
let updated: Row[] = [];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import {
  nudgeConversation,
  replyToConversation,
  resolveTicket,
  setConversationState,
} from './actions';

const CID = '66666666-6666-4666-8666-666666666666';
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  guard = null;
  actor = { adminUserId: 'admin-1' };
  env.whatsapp = true;
  sid.value = 'HX123';
  conversation = {
    id: CID,
    address: '+966500000000',
    locale: 'ar',
    lastInboundAt: new Date(),
    guestId: 'g1',
  };
  ticket = { id: 't1', reference: 'TK-ABC123' };
  updated = [{ id: CID }];
  reply.mockClear();
  template.mockClear();
  openTicket.mockClear();
  fake.current = createDbFake({
    query: {
      conversations: { findFirst: () => conversation },
      supportTickets: { findFirst: () => ticket },
    },
    update: () => updated,
  });
});

describe('replyToConversation', () => {
  it('gates on the admin, the body and the WhatsApp configuration', async () => {
    guard = { reason: 'no_db' };
    expect(await replyToConversation(initial, form({ conversationId: CID, body: 'hi' }))).toEqual({
      success: false,
      message: 'no_db',
    });
    guard = null;
    expect(
      await replyToConversation(initial, form({ conversationId: CID, body: '  ' })),
    ).toMatchObject({ message: 'validation' });
    env.whatsapp = false;
    expect(
      await replyToConversation(initial, form({ conversationId: CID, body: 'hi' })),
    ).toMatchObject({
      message: 'not_configured',
      values: { body: 'hi' },
    });
  });

  it('refuses outside the 24h service window and otherwise sends as the admin and takes the thread', async () => {
    conversation = { ...conversation, lastInboundAt: new Date(Date.now() - 25 * 3_600_000) };
    expect(
      await replyToConversation(initial, form({ conversationId: CID, body: 'hi' })),
    ).toMatchObject({ message: 'window_closed' });
    conversation = { ...conversation, lastInboundAt: new Date() };
    expect(await replyToConversation(initial, form({ conversationId: CID, body: 'hi' }))).toEqual({
      success: true,
    });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'admin', type: 'support_reply', locale: 'ar' }),
    );
    expect(fake.current?.updates[0]).toMatchObject({ state: 'human' });
  });
});

describe('admin perimeter', () => {
  it('every action refuses a non-admin with no write and no send', async () => {
    guard = { reason: 'not_admin' };
    actor = { refused: true };
    expect(await replyToConversation(initial, form({ conversationId: CID, body: 'hi' }))).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(
      await setConversationState(initial, form({ conversationId: CID, state: 'closed' })),
    ).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(await resolveTicket(initial, form({ ticketId: CID }))).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(await nudgeConversation(initial, form({ conversationId: CID }))).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(fake.current?.updates).toEqual([]);
    expect(fake.current?.inserts).toEqual([]);
    expect(reply).not.toHaveBeenCalled();
    expect(template).not.toHaveBeenCalled();
  });
});

describe('setConversationState / resolveTicket / nudgeConversation', () => {
  it('flips the state and clears the agent lock; unknown ids are not_found', async () => {
    expect(
      await setConversationState(initial, form({ conversationId: CID, state: 'closed' })),
    ).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({ state: 'closed', agentLockUntil: null });
    updated = [];
    expect(
      await setConversationState(initial, form({ conversationId: CID, state: 'bot' })),
    ).toMatchObject({ message: 'not_found' });
  });

  it('resolves a ticket once, journals it and tells the guest inside the window', async () => {
    updated = [{ id: 't1', reference: 'TK-ABC123', conversationId: CID }];
    expect(await resolveTicket(initial, form({ ticketId: CID, resolutionNote: 'done' }))).toEqual({
      success: true,
    });
    expect(fake.current?.updates[0]).toMatchObject({
      status: 'resolved',
      resolvedByUserId: 'admin-1',
      resolutionNote: 'done',
    });
    expect(fake.current?.inserts[0]).toMatchObject({
      ticketId: 't1',
      kind: 'resolved',
      actor: 'admin',
    });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'تم TK-ABC123', type: 'support_ticket_resolved' }),
    );
    expect(template).not.toHaveBeenCalled();
  });

  it('falls back to the approved template when the window is closed, and is not_found when already resolved', async () => {
    updated = [{ id: 't1', reference: 'TK-ABC123', conversationId: CID }];
    conversation = { ...conversation, lastInboundAt: new Date(Date.now() - 30 * 3_600_000) };
    expect(await resolveTicket(initial, form({ ticketId: CID }))).toEqual({ success: true });
    expect(template).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'support_ticket_resolved' }),
    );
    updated = [];
    expect(await resolveTicket(initial, form({ ticketId: CID }))).toMatchObject({
      message: 'not_found',
    });
  });

  it('a nudge needs an approved template, reuses the open ticket, and opens one when none is open', async () => {
    sid.value = null;
    expect(await nudgeConversation(initial, form({ conversationId: CID }))).toMatchObject({
      message: 'no_template',
    });
    sid.value = 'HX123';
    expect(await nudgeConversation(initial, form({ conversationId: CID }))).toEqual({
      success: true,
    });
    expect(template).toHaveBeenCalledWith(
      expect.objectContaining({ vars: { ticketReference: 'TK-ABC123' } }),
    );
    expect(openTicket).not.toHaveBeenCalled();
    ticket = undefined;
    expect(await nudgeConversation(initial, form({ conversationId: CID }))).toEqual({
      success: true,
    });
    expect(openTicket).toHaveBeenCalledTimes(1);
    expect(template).toHaveBeenLastCalledWith(
      expect.objectContaining({ vars: { ticketReference: 'TK-NEW001' } }),
    );
  });
});
