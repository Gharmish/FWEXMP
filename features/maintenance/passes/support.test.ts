import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

const sweep = vi.hoisted(() => ({ stop: null as null | (() => boolean) }));

vi.mock('@/features/conversations/inbound', () => ({
  purgeExpiredConversations: async () => 0,
  sweepUnacknowledgedInbound: async () => 0,
}));
vi.mock('@/features/support-agent/agent', () => ({
  AGENT_TURN_MAX_MS: 80_000,
  sweepPendingAgentTurns: async (_minAgeMs?: number, _limit?: number, stop?: () => boolean) => {
    sweep.stop = stop ?? null;
    return 0;
  },
}));
vi.mock('@/features/support-agent/report', () => ({ maybeSendDailyReport: async () => false }));
vi.mock('@/features/support/tickets', () => ({ sweepTicketSla: async () => 0 }));

import { RUN_BUDGET_MS, createPassRunner } from '@/features/maintenance/runner';
import { sweepSupportLine } from './support';

afterEach(() => {
  vi.useRealTimers();
});

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

  // Review of #94: a turn that starts with less than a worst-case turn of
  // budget left still runs its full length, past the function limit.
  it('stops before the budget runs out when a worst-case turn no longer fits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T07:00:00Z'));
    const run = createPassRunner();

    await sweepSupportLine(run);
    expect(sweep.stop).toBeTypeOf('function');

    // 100 s in: 140 s left, a worst-case turn (80 s) fits.
    vi.advanceTimersByTime(100_000);
    expect(run.overBudget()).toBe(false);
    expect(sweep.stop?.()).toBe(false);
    expect(run.truncatedPasses).toEqual([]);

    // 200 s in: 40 s left, under budget but not enough for one more turn.
    vi.advanceTimersByTime(100_000);
    expect(run.overBudget()).toBe(false);
    expect(Date.now() - run.startedAt).toBeLessThan(RUN_BUDGET_MS);
    expect(sweep.stop?.()).toBe(true);
    expect(run.truncatedPasses).toEqual(['3c-agent-turns']);
  });
});
