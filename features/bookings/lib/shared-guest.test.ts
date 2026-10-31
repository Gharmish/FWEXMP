import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * The read-side rule for a booking's pages (#264, 2026-10-31): the guest
 * row's name, email and billing address are shown only when the row is
 * an account's own or no other booking shares it. The SQL itself is
 * pinned in shared-guest.render.test.ts; this suite covers the decision.
 */
const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

const state = vi.hoisted(() => ({
  otherBookings: [] as Array<{ id: string }>,
  fail: false,
  fake: null as ReturnType<typeof createDbFake> | null,
}));
vi.mock('@/lib/db', () => ({
  get db() {
    return state.fake;
  },
}));

import { guestRowReadableForBooking } from './shared-guest';

const booking = { id: 'b-1', guestId: 'g-1', guestHasAccount: false };

beforeEach(() => {
  reportError.mockClear();
  state.otherBookings = [];
  state.fail = false;
  state.fake = createDbFake({
    select: () => {
      if (state.fail) throw new Error('pool closed');
      return state.otherBookings;
    },
  });
});

describe('guestRowReadableForBooking', () => {
  it('shows the row to the only booking on it', async () => {
    expect(await guestRowReadableForBooking(booking)).toBe(true);
  });

  it('hides a shared anonymous row: another booking reads the same name, email and address (#264)', async () => {
    state.otherBookings = [{ id: 'b-2' }];
    expect(await guestRowReadableForBooking(booking)).toBe(false);
  });

  it("always shows an account's own row (every booking on it is the account's since #40)", async () => {
    state.otherBookings = [{ id: 'b-2' }];
    expect(await guestRowReadableForBooking({ ...booking, guestHasAccount: true })).toBe(true);
  });

  it('fails closed when the row cannot be checked', async () => {
    state.fail = true;
    expect(await guestRowReadableForBooking(booking)).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
