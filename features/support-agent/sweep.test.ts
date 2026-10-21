import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The hourly run's agent sweep re-runs stuck bot turns one after another,
 * each allowed over a minute. It must check the run budget before every
 * turn, or a handful of slow turns outlasts the function limit and kills
 * the passes after it, heartbeat included.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    address: string;
    locale: 'en' | 'ar';
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
  }>,
  findFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => state.rows,
  };
  return {
    db: {
      select: () => chain,
      query: { conversationMessages: { findFirst: state.findFirst } },
    },
  };
});
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test', ANTHROPIC_API_KEY: 'k' },
  hasSupportAgent: () => true,
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/features/conversations/inbound', () => ({
  ACK_COPY: { en: 'ack', ar: 'ack' },
  sendConversationReply: vi.fn(),
}));
vi.mock('@/features/support/tickets', () => ({ openTicket: vi.fn() }));
vi.mock('./knowledge', () => ({ buildKnowledge: async () => 'KB' }));
vi.mock('./identity', () => ({ readIdentityState: vi.fn() }));
vi.mock('./tools', () => ({ TOOLS: [], toolsFor: () => [], runTool: vi.fn() }));

import { sweepPendingAgentTurns } from './agent';

beforeEach(() => {
  state.findFirst.mockReset();
  // A bot thread whose last inbound is ten minutes old and unanswered.
  state.rows = [
    {
      id: 'c1',
      address: '+966500000000',
      locale: 'en',
      lastInboundAt: new Date(Date.now() - 10 * 60_000),
      lastOutboundAt: null,
    },
  ];
});

describe('sweepPendingAgentTurns run budget', () => {
  it('starts no turn once the caller says stop', async () => {
    const shouldStop = vi.fn(() => true);
    expect(await sweepPendingAgentTurns(undefined, undefined, shouldStop)).toBe(0);
    expect(shouldStop).toHaveBeenCalled();
    expect(state.findFirst).not.toHaveBeenCalled();
  });

  it('keeps sweeping while there is budget', async () => {
    // The thread already ends in a reply, so the sweep reads it and moves on.
    state.findFirst.mockResolvedValue({ id: 'm1', direction: 'out' });
    expect(await sweepPendingAgentTurns(undefined, undefined, () => false)).toBe(0);
    expect(state.findFirst).toHaveBeenCalledTimes(1);
  });
});
