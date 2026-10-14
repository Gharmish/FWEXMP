import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/features/account/cookie', () => ({
  LAST_BOOKING_COOKIE: 'gh_last_booking',
  parseLastBookingCookie: () => null,
}));
vi.mock('@/lib/booking-link-token', () => ({
  bookingLinkTokenValid: (_ref: string, token: string | undefined) => token === 'signed-ok',
}));
const releaseWalletReservation = vi.fn<(id: string) => Promise<{ released: boolean }>>(
  async () => ({ released: true }),
);
vi.mock('@/features/wallet/reservation', () => ({
  releaseWalletReservation: (id: string) => releaseWalletReservation(id),
}));
const ledger = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: (input: unknown) => ledger(input),
}));

type Row = Record<string, unknown>;
let hold: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { db } from '@/lib/db';
import type { BookingRequestInput } from '@/features/bookings/lib/request/form';
import {
  cancelSupersededHold,
  finishSupersededHoldRelease,
  freeHeldSeats,
  resolveSupersededHold,
  supersededHoldSeats,
} from './supersede';

const OLD = '13131313-1313-4131-8131-131313131313';
const NEW = '24242424-2424-4242-8242-242424242424';
const input = {
  supersedes: OLD,
  supersedesToken: 'signed-ok',
  phone: '+966541104000',
} as BookingRequestInput;

/**
 * The pay step prepares a gateway checkout the moment it renders, so the
 * hold a guest leaves behind via "change date or guests" is almost
 * always `processing`. It used to be skipped — seats and the phone-hold
 * slot stayed blocked until the deadline cron (nightly bug hunt
 * 2026-10-09).
 */
beforeEach(() => {
  releaseWalletReservation.mockClear();
  ledger.mockClear();
  hold = {
    id: 'b-old',
    contactPhone: '+966541104000',
    status: 'confirmed',
    paymentStatus: 'processing',
    paymentDeadline: new Date(Date.now() + 20 * 60_000),
    settleAnomalyAt: null,
    walletAppliedSar: 0,
    checkoutId: 'chk-1',
    totalAmount: 250,
  };
  fake.current = createDbFake({
    query: { bookings: { findFirst: () => hold } },
    update: () => [{ id: 'b-old' }],
  });
});

describe('resolveSupersededHold', () => {
  it('qualifies a hold whose checkout is prepared but unpaid, carrying the checkout id', async () => {
    expect(await resolveSupersededHold(input, NEW)).toEqual({
      id: 'b-old',
      walletAppliedSar: 0,
      liveCheckoutId: 'chk-1',
      totalAmountSar: 250,
      countsForPhone: true,
    });
  });

  it('carries no checkout for a plain unpaid hold, and refuses a paid one', async () => {
    hold = { ...hold, paymentStatus: 'unpaid', checkoutId: null };
    expect(await resolveSupersededHold(input, NEW)).toMatchObject({ liveCheckoutId: null });
    hold = { ...hold, paymentStatus: 'paid', checkoutId: 'chk-1' };
    expect(await resolveSupersededHold(input, NEW)).toBeNull();
  });

  it('still demands proof of ownership', async () => {
    expect(await resolveSupersededHold({ ...input, supersedesToken: 'forged' }, NEW)).toBeNull();
  });
});

/** The cancel runs inside the capacity transaction; `db.transaction` on the fake hands the fake back. */
describe('cancelSupersededHold + finishSupersededHoldRelease', () => {
  it('retires the prepared checkout the way a promo change does and journals it', async () => {
    const resolved = await resolveSupersededHold(input, NEW);
    expect(await db.transaction((tx) => cancelSupersededHold(tx, resolved!))).toBe(true);
    expect(fake.current?.updates[0]).toMatchObject({
      status: 'cancelled',
      cancellationKind: 'system',
      paymentStatus: 'unpaid',
    });
    expect(fake.current?.updates[0]?.checkoutSupersededAt).toBeInstanceOf(Date);
    await finishSupersededHoldRelease(resolved!, NEW);
    expect(ledger).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b-old',
        type: 'checkout_superseded',
        gatewayId: 'chk-1',
        amountSar: 250,
      }),
    );
    expect(releaseWalletReservation).not.toHaveBeenCalled();
  });

  it('cancels a plain unpaid hold without touching its payment state, and returns applied credit', async () => {
    hold = { ...hold, paymentStatus: 'unpaid', checkoutId: null, walletAppliedSar: 40 };
    const resolved = await resolveSupersededHold(input, NEW);
    expect(await db.transaction((tx) => cancelSupersededHold(tx, resolved!))).toBe(true);
    expect(fake.current?.updates[0]).not.toHaveProperty('paymentStatus');
    expect(fake.current?.updates[0]).not.toHaveProperty('checkoutSupersededAt');
    await finishSupersededHoldRelease(resolved!, NEW);
    expect(ledger).not.toHaveBeenCalled();
    expect(releaseWalletReservation).toHaveBeenCalledWith('b-old');
  });

  it('reports a guarded update that matched no row (payment raced ahead) so nothing further runs', async () => {
    fake.current = createDbFake({
      query: { bookings: { findFirst: () => hold } },
      update: () => [],
    });
    const resolved = await resolveSupersededHold(input, NEW);
    expect(await db.transaction((tx) => cancelSupersededHold(tx, resolved!))).toBe(false);
    expect(ledger).not.toHaveBeenCalled();
    expect(releaseWalletReservation).not.toHaveBeenCalled();
  });
});

describe('the listing calendar gives the guest their own held seats back (#77)', () => {
  beforeEach(() => {
    hold = { ...hold, experienceId: 'exp-1', date: '2026-11-02', partySize: 4 };
  });

  it('returns the held seats for a live hold on this listing, proven by token', async () => {
    expect(await supersededHoldSeats(OLD, 'signed-ok', 'exp-1')).toEqual({
      date: '2026-11-02',
      partySize: 4,
    });
  });

  it('gives nothing back without proof, for another listing, or for a paid hold', async () => {
    expect(await supersededHoldSeats(OLD, 'forged', 'exp-1')).toBeNull();
    expect(await supersededHoldSeats(OLD, 'signed-ok', 'exp-2')).toBeNull();
    hold = { ...hold, paymentStatus: 'paid' };
    expect(await supersededHoldSeats(OLD, 'signed-ok', 'exp-1')).toBeNull();
    expect(await supersededHoldSeats(undefined, 'signed-ok', 'exp-1')).toBeNull();
  });

  it('frees the held seats on their date only', () => {
    const booked = { '2026-11-02': 8, '2026-11-03': 5 };
    expect(freeHeldSeats(booked, { date: '2026-11-02', partySize: 4 })).toEqual({
      '2026-11-02': 4,
      '2026-11-03': 5,
    });
    expect(freeHeldSeats(booked, null)).toBe(booked);
    expect(freeHeldSeats(booked, { date: '2026-11-09', partySize: 4 })).toBe(booked);
  });
});
