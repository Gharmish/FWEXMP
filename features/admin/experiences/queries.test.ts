import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGuardFailure } from '@/features/admin/guard';

/**
 * Issue #56: the admin layout renders the TOTP screen in place of
 * `children`, but the App Router still renders the page segment and
 * serialises it into the flight payload. These reads must therefore
 * refuse on their own when the second factor is pending.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  guard: null as AdminGuardFailure | null,
  dbCalls: 0,
}));

vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => state.guard }));
vi.mock('@/features/admin/experience-moderation/queries', () => ({
  isAdminAndDbReady: async () => state.guard,
}));

vi.mock('@/lib/db', () => {
  const rows = [{ id: 'h-1', name: 'Host' }];
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: async () => rows,
  };
  return {
    db: {
      select: () => {
        state.dbCalls += 1;
        return chain;
      },
      query: {
        experiences: {
          findFirst: async () => {
            state.dbCalls += 1;
            return undefined;
          },
        },
      },
    },
  };
});

import { getAdminExperienceForEdit, getExperienceMoments, listHostsForSelect } from './queries';

describe('admin experience queries re-gate (issue #56)', () => {
  beforeEach(() => {
    state.guard = null;
    state.dbCalls = 0;
  });

  it('returns nothing and never reads when the second factor is pending', async () => {
    state.guard = { reason: 'mfa_required' };

    expect(await listHostsForSelect()).toEqual([]);
    expect(await getExperienceMoments('e-1')).toEqual([]);
    expect(await getAdminExperienceForEdit('e-1')).toBeUndefined();
    expect(state.dbCalls).toBe(0);
  });

  it('refuses a non-admin the same way', async () => {
    state.guard = { reason: 'not_admin' };

    expect(await listHostsForSelect()).toEqual([]);
    expect(state.dbCalls).toBe(0);
  });

  it('reads for a verified admin', async () => {
    expect(await listHostsForSelect()).toEqual([{ id: 'h-1', name: 'Host' }]);
    expect(state.dbCalls).toBe(1);
  });
});
