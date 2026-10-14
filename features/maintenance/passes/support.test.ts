import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

const sweep = vi.hoisted(() => ({ stop: null as null | (() => boolean) }));

vi.mock('@/features/conversations/inbound', () => ({
  purgeExpiredConversations: async () => 0,
  sweepUnacknowledgedInbound: async () => 0,
}));
vi.mock('@/features/support-agent/agent', () => ({
  sweepPendingAgentTurns: async (_minAgeMs?: number, _limit?: number, stop?: () => boolean) => {
    sweep.stop = stop ?? null;
    return 0;
  },
}));
vi.mock('@/features/support-agent/report', () => ({ maybeSendDailyReport: async () => false }));
vi.mock('@/features/support/tickets', () => ({ sweepTicketSla: async () => 0 }));

import { createPassRunner } from '@/features/maintenance/runner';
import { sweepSupportLine } from './support';

describe('sweepSupportLine agent-turn budget', () => {
  it('hands the agent sweep a per-turn stop wired to the run budget', async () => {
    let over = false;
    const run = createPassRunner();
    run.overBudget = () => over;

    await sweepSupportLine(run);
    expect(sweep.stop).toBeTypeOf('function');

    expect(sweep.stop?.()).toBe(false);
    expect(run.truncatedPasses).toEqual([]);

    over = true;
    expect(sweep.stop?.()).toBe(true);
    expect(run.truncatedPasses).toEqual(['3c-agent-turns']);
  });
});
