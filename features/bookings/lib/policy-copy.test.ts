import { describe, expect, it } from 'vitest';
import { CANCELLATION_TIERS } from '@/features/bookings/lib/policy';
import {
  policyWindow,
  tierDescription,
  tierDescriptions,
  type TierTranslator,
} from '@/features/bookings/lib/policy-copy';

// Echoes key + values, so assertions see exactly what would be translated.
const t: TierTranslator = (key, values) =>
  values ? `${key}(${JSON.stringify(values)})` : key;

describe('policyWindow', () => {
  it('renders short windows in hours', () => {
    expect(policyWindow(24, t)).toBe('windowHours({"count":24,"n":24})');
    expect(policyWindow(48, t)).toBe('windowHours({"count":48,"n":48})');
  });

  it('renders long windows as days, never "168 hours"', () => {
    expect(policyWindow(96, t)).toBe('windowDays({"count":4,"n":4})');
    expect(policyWindow(168, t)).toBe('windowDays({"count":7,"n":7})');
  });

  it('keeps sub-4-day windows in hours — "72 hours", not "3 days"', () => {
    expect(policyWindow(72, t)).toBe('windowHours({"count":72,"n":72})');
  });

  it('keeps non-day-aligned long windows in hours', () => {
    expect(policyWindow(100, t)).toBe('windowHours({"count":100,"n":100})');
  });
});

describe('tierDescription', () => {
  it('uses the no-partial sentence when bps is 0', () => {
    const s = tierDescription(CANCELLATION_TIERS.flexible, t);
    expect(s).toContain('descNoPartial');
    expect(s).toContain('name_flexible');
  });

  it('states the partial step (pct from bps) when present', () => {
    const s = tierDescription(CANCELLATION_TIERS.moderate, t);
    expect(s).toContain('descWithPartial');
    expect(s).toContain('"pct":50');
  });

  it('covers all three tiers keyed by tier', () => {
    const all = tierDescriptions(CANCELLATION_TIERS, t);
    expect(Object.keys(all).sort()).toEqual(['flexible', 'moderate', 'strict']);
    expect(all.strict).toContain('descWithPartial');
  });
});
