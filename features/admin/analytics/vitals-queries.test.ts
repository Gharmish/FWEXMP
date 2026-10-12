import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGuardFailure } from '@/features/admin/guard';

/** Issue #56: the vitals read re-gates — the layout's TOTP screen does not stop the page segment rendering. */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  guard: null as AdminGuardFailure | null,
  dbCalls: 0,
}));

vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => state.guard }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: async () => [],
  };
  return {
    db: {
      select: () => {
        state.dbCalls += 1;
        return chain;
      },
    },
  };
});

import { getWebVitalsSummary } from './vitals-queries';

describe('getWebVitalsSummary re-gates (issue #56)', () => {
  beforeEach(() => {
    state.guard = null;
    state.dbCalls = 0;
  });

  it('returns null and never reads when the second factor is pending', async () => {
    state.guard = { reason: 'mfa_required' };
    expect(await getWebVitalsSummary()).toBeNull();
    expect(state.dbCalls).toBe(0);
  });

  it('reads for a verified admin', async () => {
    expect(await getWebVitalsSummary()).not.toBeNull();
    expect(state.dbCalls).toBe(2);
  });
});
