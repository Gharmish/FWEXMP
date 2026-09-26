import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Freeze the clock so fixtures built from `new Date()` never drift across
// midnight or DST (2026-09 engineering audit TEST-13). Only Date is faked;
// timers stay real for the deadline helpers.
const FIXED_NOW = new Date('2026-09-11T09:00:00.000Z');
beforeAll(() => vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] }));
afterAll(() => vi.useRealTimers());
import type Anthropic from '@anthropic-ai/sdk';

/**
 * runAgentTurn's lock + re-check loop (2026-09 engineering audit AI-01).
 * A WhatsApp message that lands while a turn is running finds the lock
 * held, so the running turn must notice it after replying and answer it
 * under the same lock — bounded, and always releasing the lock at the end.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    DATABASE_URL: 'postgres://test',
    ANTHROPIC_API_KEY: 'k',
    SUPPORT_AGENT_MODEL: 'claude-opus-4-8',
  },
  hasSupportAgent: () => true,
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
const sendConversationReply = vi.fn(async () => ({ ok: true }));
vi.mock('@/features/conversations/inbound', () => ({
  ACK_COPY: { en: 'ack', ar: 'ack' },
  sendConversationReply: (...args: unknown[]) => sendConversationReply(...(args as [])),
}));
const openTicket = vi.fn(async () => ({
  reference: 'TK-1',
  priority: 'high',
  slaDueAt: new Date(),
}));
vi.mock('@/features/support/tickets', () => ({
  openTicket: (...args: unknown[]) => openTicket(...(args as [])),
}));
vi.mock('./knowledge', () => ({ buildKnowledge: async () => 'KB' }));
vi.mock('./tools', () => ({ TOOLS: [], toolsFor: () => [], runTool: vi.fn() }));
vi.mock('./identity', () => ({
  readIdentityState: async () => ({ verified: false, hasEmail: true }),
}));

const T0 = new Date('2026-09-11T10:00:00.000Z');
let history: Array<{
  direction: 'in' | 'out';
  body: string;
  mediaContentType: null;
  createdAt: Date;
}> = [];
/** Successive results of the post-reply "any newer inbound?" query. */
let newerQueue: Array<Array<{ id: string }>> = [];
const lockSets: Array<Record<string, unknown>> = [];
/** Agent turns counted by the daily budget query (per conversation and global). */
let budgetCount = 0;

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        lockSets.push(values);
        return {
          where: () => {
            const p = Promise.resolve(undefined) as Promise<unknown> & {
              returning: () => Promise<unknown[]>;
            };
            p.returning = async () => [{ guestId: 'g1', hostId: null, locale: 'en' }];
            return p;
          },
        };
      },
    }),
    select: (shape: Record<string, unknown>) => ({
      from: () => ({
        // Awaited directly by the daily budget counts ({ n }); chained
        // through orderBy/limit by loadThread (message shape) and the
        // post-reply re-check ({ id }).
        where: () =>
          Object.assign(Promise.resolve([{ n: budgetCount }]), {
            orderBy: () => ({
              limit: async () =>
                'direction' in shape ? [...history].reverse() : (newerQueue.shift() ?? []),
            }),
          }),
      }),
    }),
  },
}));

import { runAgentTurn, setAnthropicClientForTests } from './agent';

function textReplyClient(texts: string[]): Anthropic {
  const queue = [...texts];
  return {
    messages: {
      create: async () => ({
        id: 'm',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: queue.shift() ?? 'ok', citations: null }],
      }),
    },
  } as unknown as Anthropic;
}

const recorded = {
  conversationId: 'c1',
  messageId: 'm1',
  locale: 'en' as const,
  guestName: 'Sara',
  shouldAck: false,
  isNew: true,
  state: 'bot' as const,
};

beforeEach(() => {
  history = [{ direction: 'in', body: 'hi', mediaContentType: null, createdAt: T0 }];
  newerQueue = [];
  lockSets.length = 0;
  budgetCount = 0;
  sendConversationReply.mockClear();
});

const dedupeKeys = () =>
  sendConversationReply.mock.calls.map(
    (c) => (c as unknown as [{ dedupeKey: string }])[0].dedupeKey,
  );
const releases = () => lockSets.filter((v) => 'agentLockUntil' in v && v.agentLockUntil === null);
const holds = () => lockSets.filter((v) => v.agentLockUntil instanceof Date);

describe('runAgentTurn re-check loop', () => {
  it('replies once and releases the lock when nothing new arrived', async () => {
    setAnthropicClientForTests(textReplyClient(['Welcome!']));
    const out = await runAgentTurn(recorded, '+966500000001');
    expect(out.outcome).toBe('replied');
    expect(dedupeKeys()).toEqual(['support_agent:m1:0']);
    expect(holds()).toHaveLength(1); // the acquisition
    expect(releases()).toHaveLength(1);
  });

  it('answers a message that landed mid-turn under the same lock', async () => {
    setAnthropicClientForTests(textReplyClient(['First answer', 'Second answer']));
    newerQueue = [[{ id: 'm2' }], []];
    const out = await runAgentTurn(recorded, '+966500000001');
    expect(out.outcome).toBe('replied');
    expect(dedupeKeys()).toEqual(['support_agent:m1:0', 'support_agent:m2:0']);
    // acquisition + one extension between the passes, one release at the end
    expect(holds()).toHaveLength(2);
    expect(releases()).toHaveLength(1);
  });

  it('is bounded: never more than three passes, then releases', async () => {
    setAnthropicClientForTests(textReplyClient(['a', 'b', 'c', 'd', 'e']));
    newerQueue = [[{ id: 'm2' }], [{ id: 'm3' }], [{ id: 'm4' }], [{ id: 'm5' }]];
    const out = await runAgentTurn(recorded, '+966500000001');
    expect(out.outcome).toBe('replied');
    expect(sendConversationReply).toHaveBeenCalledTimes(3);
    expect(releases()).toHaveLength(1);
  });

  it('skips without a model call when the thread was already answered under the other leg', async () => {
    // Two messages 1.7s apart: the second leg took the lock first and
    // answered both; this leg (the first message's) then finds the thread
    // ending in that reply. Prod 2026-09-25: it ran anyway, the API
    // rejected the assistant-ending thread (400 prefill), and the fail-safe
    // opened a ticket and sent a second acknowledgement.
    let modelCalls = 0;
    setAnthropicClientForTests({
      messages: {
        create: async () => {
          modelCalls += 1;
          throw new Error('400 assistant message prefill');
        },
      },
    } as unknown as Anthropic);
    history = [
      { direction: 'in', body: 'hi', mediaContentType: null, createdAt: T0 },
      {
        direction: 'in',
        body: 'anyone there?',
        mediaContentType: null,
        createdAt: new Date(T0.getTime() + 1_700),
      },
      {
        direction: 'out',
        body: 'Welcome!',
        mediaContentType: null,
        createdAt: new Date(T0.getTime() + 4_600),
      },
    ];
    const out = await runAgentTurn(recorded, '+966500000001');
    expect(out.outcome).toBe('skipped');
    expect(modelCalls).toBe(0);
    expect(sendConversationReply).not.toHaveBeenCalled();
    expect(holds()).toHaveLength(1); // the acquisition
    expect(releases()).toHaveLength(1); // and it let go
  });

  it('returns skipped without running when the lock is held', async () => {
    // A held lock makes the conditional UPDATE match zero rows.
    const client = textReplyClient(['never']);
    setAnthropicClientForTests(client);
    const mod = await import('@/lib/db');
    const db = mod.db as unknown as { update: () => unknown };
    const original = db.update;
    db.update = () => ({
      set: () => ({
        where: () => {
          const p = Promise.resolve(undefined) as Promise<unknown> & {
            returning: () => Promise<unknown[]>;
          };
          p.returning = async () => [];
          return p;
        },
      }),
    });
    try {
      const out = await runAgentTurn(recorded, '+966500000001');
      expect(out.outcome).toBe('skipped');
      expect(sendConversationReply).not.toHaveBeenCalled();
    } finally {
      db.update = original;
    }
  });
});

describe('runAgentTurn spend ceiling (2026-09 engineering audit AI-02)', () => {
  it('hands the thread to a person without a model call once the daily cap is hit', async () => {
    budgetCount = 40;
    const client = textReplyClient(['should never be sent']);
    setAnthropicClientForTests(client);
    const out = await runAgentTurn(recorded, '+966500000001');
    expect(out.outcome).toBe('failed');
    expect(openTicket).toHaveBeenCalledWith(
      expect.objectContaining({ summary: expect.stringContaining('daily agent budget exceeded') }),
    );
    // The fail-safe acks the guest but no agent reply was generated.
    expect(sendConversationReply).toHaveBeenCalledTimes(1);
    const ack = (sendConversationReply.mock.calls[0] as unknown as [{ type: string }])[0];
    expect(ack.type).toBe('support_ack');
  });
});
