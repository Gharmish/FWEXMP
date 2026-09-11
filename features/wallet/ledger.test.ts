import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { spendableBalance } from './ledger';

describe('spendableBalance (2026-09 engineering audit MONEY-07)', () => {
  it('subtracts lots that expired but were not swept yet', () => {
    expect(
      spendableBalance({ balance: 150, expiredUnswept: 100, refundCredits: 0, refundOuts: 0 }),
    ).toBe(50);
  });

  it("never expires the guest's own refund credit", () => {
    // 100 refund credit + 50 expired goodwill: the sweep may expire at most 50.
    expect(
      spendableBalance({ balance: 150, expiredUnswept: 50, refundCredits: 100, refundOuts: 0 }),
    ).toBe(100);
    // An expired lot larger than what is expirable is floored at the protected remainder.
    expect(
      spendableBalance({ balance: 120, expiredUnswept: 80, refundCredits: 100, refundOuts: 0 }),
    ).toBe(100);
    // Credit already moved back to card is no longer protected.
    expect(
      spendableBalance({ balance: 120, expiredUnswept: 80, refundCredits: 100, refundOuts: 100 }),
    ).toBe(40);
  });

  it('is the plain balance with nothing expired', () => {
    expect(
      spendableBalance({ balance: 75, expiredUnswept: 0, refundCredits: 0, refundOuts: 0 }),
    ).toBe(75);
    expect(spendableBalance(undefined)).toBe(0);
  });
});
