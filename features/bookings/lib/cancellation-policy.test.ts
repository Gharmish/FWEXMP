import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * Pins the tier loader's two contracts: the rows are read through a
 * TAGGED, time-bounded Next data-cache entry (the experience page's one
 * former uncached read — see the loader's comment), and every failure
 * mode — a thrown load, a missing tier, an incoherent row — degrades to
 * the code defaults per tier without throwing.
 */
const cacheEntry = vi.hoisted(() => ({
  keys: undefined as unknown,
  options: undefined as unknown,
}));
vi.mock('next/cache', () => ({
  // The data cache is Next's to test; this pins what the loader hands it
  // and otherwise calls straight through.
  unstable_cache: (fn: () => Promise<unknown>, keys: unknown, options: unknown) => {
    cacheEntry.keys = keys;
    cacheEntry.options = options;
    return fn;
  },
  updateTag: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://unit-test' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn(), reportWarning: vi.fn() }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
  getDbGeneration: () => 0,
  resetDb: () => false,
}));

import { reportError } from '@/lib/log';
import { CANCELLATION_TIERS } from './policy';
import {
  getCancellationTiers,
  getTierSnapshot,
  TIER_ROWS_REVALIDATE_SECONDS,
} from './cancellation-policy';

const row = (tier: string, over: Record<string, number> = {}) => ({
  tier,
  freeCancelHours: 96,
  partialRefundHours: 48,
  partialRefundBps: 5000,
  rescheduleCutoffHours: 24,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCancellationTiers', () => {
  it('reads the tiers through a tagged, time-bounded data-cache entry', async () => {
    fake.current = createDbFake({
      select: () => [row('flexible'), row('moderate'), row('strict')],
    });
    const tiers = await getCancellationTiers();
    expect(tiers.flexible).toEqual({
      policyTier: 'flexible',
      freeCancelHours: 96,
      partialRefundHours: 48,
      partialRefundBps: 5000,
      rescheduleCutoffHours: 24,
    });
    expect(cacheEntry.keys).toEqual(['cancellation-policy-tiers']);
    expect(cacheEntry.options).toEqual({
      revalidate: TIER_ROWS_REVALIDATE_SECONDS,
      tags: ['cancellation-policies'],
    });
  });

  it('keeps the code default for a tier the table lacks', async () => {
    fake.current = createDbFake({ select: () => [row('strict', { freeCancelHours: 168 })] });
    const tiers = await getCancellationTiers();
    expect(tiers.strict.freeCancelHours).toBe(168);
    expect(tiers.flexible).toEqual(CANCELLATION_TIERS.flexible);
    expect(tiers.moderate).toEqual(CANCELLATION_TIERS.moderate);
  });

  it('quarantines an incoherent row (partial step outside the free window) and logs it', async () => {
    fake.current = createDbFake({
      select: () => [row('moderate', { freeCancelHours: 24, partialRefundHours: 48 })],
    });
    const tiers = await getCancellationTiers();
    expect(tiers.moderate).toEqual(CANCELLATION_TIERS.moderate);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'incoherent cancellation_policies row: moderate' }),
      { surface: 'cancellation-policy:tiers' },
    );
  });

  it('degrades every tier to the code defaults when the read throws', async () => {
    fake.current = createDbFake({
      select: () => {
        throw new Error('pooler hang');
      },
    });
    await expect(getCancellationTiers()).resolves.toEqual(CANCELLATION_TIERS);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      surface: 'cancellation-policy:tiers',
    });
  });
});

describe('getTierSnapshot', () => {
  it('returns one tier of the same read', async () => {
    fake.current = createDbFake({
      select: () => [row('strict', { partialRefundBps: 0, partialRefundHours: 0 })],
    });
    await expect(getTierSnapshot('strict')).resolves.toEqual({
      policyTier: 'strict',
      freeCancelHours: 96,
      partialRefundHours: 0,
      partialRefundBps: 0,
      rescheduleCutoffHours: 24,
    });
  });
});
