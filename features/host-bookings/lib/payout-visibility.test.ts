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
    },
  );
});
