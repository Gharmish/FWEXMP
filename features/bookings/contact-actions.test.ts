import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/bookings/lib/access', () => ({
  bookingViewerCanAccess: async () => access.allowed,
}));

type Row = Record<string, unknown>;
let booking: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { updateBookingContact } from './contact-actions';

const REF = '11111111-1111-4111-8111-111111111111';
const soon = new Date(Date.now() + 20 * 60_000);
function pending(over: Row = {}): Row {
  return {
    id: 'b1',
    guestId: 'g1',
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentDeadline: null,
    settleAnomalyAt: null,
    checkoutSupersededAt: null,
    guest: { authUserId: null },
    ...over,
  };
}
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('reference', REF);
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  access.allowed = true;
  booking = pending();
  fake.current = createDbFake({ query: { bookings: { findFirst: () => booking } } });
});

describe('updateBookingContact', () => {
  it('needs at least one contact and validates each', async () => {
    expect(await updateBookingContact(initial, form())).toMatchObject({
      message: 'validation',
      fields: { email: 'required' },
    });
    expect(await updateBookingContact(initial, form({ email: 'not-an-email' }))).toMatchObject({
      fields: { email: 'invalid_email' },
    });
    expect(await updateBookingContact(initial, form({ phone: '12' }))).toMatchObject({
      fields: { phone: 'invalid_phone' },
    });
  });

  it('is forbidden for a viewer who cannot prove ownership', async () => {
    access.allowed = false;
    expect(await updateBookingContact(initial, form({ email: 'a@b.co' }))).toMatchObject({
      message: 'forbidden',
    });
  });

  it('only pending requests and live unpaid holds may change contact details', async () => {
    booking = pending({ status: 'completed' });
    expect(await updateBookingContact(initial, form({ email: 'a@b.co' }))).toMatchObject({
      message: 'wrong_state',
    });
    booking = pending({ status: 'confirmed', paymentDeadline: soon });
    expect(await updateBookingContact(initial, form({ email: 'a@b.co' }))).toEqual({
      success: true,
    });
  });

  it('never rewrites an email that belongs to a signed-in account', async () => {
    booking = pending({ guest: { authUserId: 'u1' } });
    expect(await updateBookingContact(initial, form({ email: 'a@b.co' }))).toMatchObject({
      message: 'account_email',
    });
  });

  it('writes the phone onto the booking and the email onto the anonymous guest row', async () => {
    expect(
      await updateBookingContact(initial, form({ email: 'Sara@Example.com', phone: '0512345678' })),
    ).toEqual({
      success: true,
    });
    expect(fake.current?.updates).toEqual([
      { contactPhone: '+966512345678' },
      { email: 'sara@example.com' },
    ]);
  });
});
