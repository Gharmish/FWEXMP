import { describe, expect, it } from 'vitest';
import { showsHostPayout } from './payout-visibility';

describe('showsHostPayout', () => {
  it.each(['pending', 'confirmed', 'completed'] as const)('shows the payout for %s', (status) => {
    expect(showsHostPayout(status)).toBe(true);
  });

  it.each(['declined', 'expired', 'cancelled', 'refunded'] as const)(
    'hides the payout for %s',
    (status) => {
      expect(showsHostPayout(status)).toBe(false);
      expect(showsHostPayout(status, null)).toBe(false);
    },
  );

  // Paid out, then refunded: the timeline still says "Paid to you" and the
  // earnings page keeps the row in "paid to date", so the figure stays.
  it('keeps the payout on a refunded booking that was already paid out', () => {
    expect(showsHostPayout('refunded', '2026-10-20T09:00:00.000Z')).toBe(true);
    expect(showsHostPayout('cancelled', '2026-10-20T09:00:00.000Z')).toBe(true);
  });
});
