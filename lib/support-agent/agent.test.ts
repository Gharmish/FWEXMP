import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: '', ANTHROPIC_API_KEY: 'k', SUPPORT_AGENT_MODEL: 'claude-opus-4-8' },
  hasSupportAgent: () => true,
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/lib/conversations/inbound', () => ({
  ACK_COPY: { en: 'ack', ar: 'ack' },
  sendConversationReply: vi.fn(),
}));
vi.mock('@/features/support/tickets', () => ({ openTicket: vi.fn() }));
vi.mock('./knowledge', () => ({ buildKnowledge: async () => 'KB' }));
const runTool = vi.fn();
vi.mock('./tools', () => ({
  TOOLS: [],
  runTool: (...args: unknown[]) => runTool(...(args as [])),
}));

import { runAgentLoop, toMessageParams } from './agent';

const ctx = {
  conversationId: 'c1',
  address: '+966541104000',
  guestId: 'g1',
  locale: 'en' as const,
  now: new Date('2026-08-21T10:00:00Z'),
  lastInbound: 'my bookings?',
};

function fakeClient(responses: Array<Partial<Anthropic.Message>>): {
  api: Anthropic;
  calls: Anthropic.MessageCreateParams[];
} {
  const calls: Anthropic.MessageCreateParams[] = [];
  const queue = [...responses];
  const api = {
    messages: {
      create: async (params: Anthropic.MessageCreateParams) => {
        calls.push(params);
        const next = queue.shift();
        if (!next) throw new Error('no more responses');
        return { id: 'm', type: 'message', role: 'assistant', content: [], stop_reason: 'end_turn', ...next };
      },
    },
  } as unknown as Anthropic;
  return { api, calls };
}

describe('toMessageParams', () => {
  it('merges consecutive same-role messages and starts with the user', () => {
    const params = toMessageParams([
      { direction: 'out', body: 'welcome' },
      { direction: 'in', body: 'hi' },
      { direction: 'in', body: 'where do we meet?' },
      { direction: 'out', body: 'At the souq.' },
    ]);
    expect(params).toEqual([
      { role: 'user', content: 'hi\n\nwhere do we meet?' },
      { role: 'assistant', content: 'At the souq.' },
    ]);
  });

  it('labels empty inbound bodies as attachments', () => {
    expect(toMessageParams([{ direction: 'in', body: '' }])).toEqual([
      { role: 'user', content: '(attachment)' },
    ]);
  });
});

describe('runAgentLoop', () => {
  it('round-trips a tool call and returns the final text', async () => {
    runTool.mockResolvedValueOnce({ result: '{"bookings":[]}' });
    const { api, calls } = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'list_my_bookings', input: {}, caller: { type: 'direct' } }],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have no bookings yet.', citations: null }] },
    ]);

    const out = await runAgentLoop(
      { history: [{ direction: 'in', body: 'my bookings?' }], ctx, guestName: 'Sara' },
      api,
    );

    expect(out.reply).toBe('You have no bookings yet.');
    expect(out.toolCalls).toEqual([{ name: 'list_my_bookings', input: {}, ok: true }]);
    expect(runTool).toHaveBeenCalledWith('list_my_bookings', {}, ctx);
    // Second request carries the tool result back.
    const second = calls[1].messages;
    expect(second[second.length - 1]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"bookings":[]}' }],
    });
    // Stable rules+knowledge first (cached), volatile block second.
    const system = calls[0].system as Anthropic.TextBlockParam[];
    expect(system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[0].text).toContain('KB');
    expect(system[1].text).toContain('Sara');
  });

  it('reports a handoff when the escalate tool fires', async () => {
    runTool.mockResolvedValueOnce({
      result: '{"ticket_reference":"TK-1"}',
      handedToHuman: true,
      ticketReference: 'TK-1',
    });
    const { api } = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'escalate_to_human', input: { category: 'other', priority: 'high', summary: 's' }, caller: { type: 'direct' } }],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'A person will follow up (TK-1).', citations: null }] },
    ]);

    const out = await runAgentLoop(
      { history: [{ direction: 'in', body: 'I want a human' }], ctx, guestName: null },
      api,
    );

    expect(out.handedToHuman).toBe(true);
    expect(out.ticketReference).toBe('TK-1');
    expect(out.reply).toContain('TK-1');
  });

  it('surfaces a refusal with an empty reply so the runner can fail safe', async () => {
    const { api } = fakeClient([{ stop_reason: 'refusal', content: [] }]);

    const out = await runAgentLoop(
      { history: [{ direction: 'in', body: '…' }], ctx, guestName: null },
      api,
    );

    expect(out.stopReason).toBe('refusal');
    expect(out.reply).toBe('');
  });

  it('returns nothing to send when the thread has no user turn', async () => {
    const { api, calls } = fakeClient([]);
    const out = await runAgentLoop({ history: [{ direction: 'out', body: 'x' }], ctx, guestName: null }, api);
    expect(out.reply).toBe('');
    expect(calls).toHaveLength(0);
  });
});
