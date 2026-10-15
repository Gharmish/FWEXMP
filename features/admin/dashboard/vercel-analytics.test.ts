import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGuardFailure } from '@/features/admin/guard';

/** Issue #56: the traffic card's fetch re-gates — the layout's TOTP screen does not stop the page segment rendering. */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ guard: null as AdminGuardFailure | null }));

vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => state.guard }));
vi.mock('@/lib/env', () => ({ serverEnv: { VERCEL_ANALYTICS_TOKEN: 'token' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

import { getSiteTraffic } from './vercel-analytics';

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] })));

describe('getSiteTraffic re-gates (issue #56)', () => {
  beforeEach(() => {
    state.guard = null;
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null and never calls Vercel when the second factor is pending', async () => {
    state.guard = { reason: 'mfa_required' };
    const today = new Date().toISOString().slice(0, 10);
    expect(await getSiteTraffic({ preset: 'today', from: today, to: today })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Vercel for a verified admin', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await getSiteTraffic({ preset: 'today', from: today, to: today });
    expect(fetchMock).toHaveBeenCalled();
  });
});
