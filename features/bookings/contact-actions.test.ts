import { beforeEach, describe, expect, it, vi } from 'vitest';
import { is, StringChunk } from 'drizzle-orm';
import { createDbFake, referencedColumns } from '@/lib/test/db-fake';

/** Every raw string chunk in a drizzle SQL tree. */
function rawChunksIn(node: unknown, found: string[] = [], seen = new WeakSet<object>()): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  if (is(node, StringChunk)) {
    found.push(node.value.join(''));
    return found;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => rawChunksIn(v, found, seen));
    else if (value && typeof value === 'object') rawChunksIn(value, found, seen);
  }
  return found;
}

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
/** Other bookings on the guest row (issue #120): the row is shared when non-empty. */
let otherBookings: Row[] = [];
const sharedChecks: Row[] = [];
/** Rows the guarded guest UPDATE matches (its WHERE lost the race when empty). */
let guestRowsWritten: Row[] = [{ id: 'g1' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/deadline', () => ({
  boundedQuery: async <T>(_key: string, fn: () => Promise<T>) => fn(),
}));
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
    guest: { authUserId: null, email: 'first@example.com' },
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
  otherBookings = [];
  sharedChecks.length = 0;
  guestRowsWritten = [{ id: 'g1' }];
  fake.current = createDbFake({
    query: { bookings: { findFirst: () => booking } },
    select: (shape) => {
      sharedChecks.push(shape);
      return otherBookings;
    },
    update: (values) => ('email' in values ? guestRowsWritten : [{ id: 'b1' }]),
  });
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

  it('refuses an email change when another booking reads the same anonymous row (#120)', async () => {
    // A stranger who booked with the victim's phone shares the row; their
    // own cookie must not let them redirect the victim's booking emails.
    otherBookings = [{ id: 'b-victim' }];
    expect(await updateBookingContact(initial, form({ email: 'attacker@example.com' }))).toEqual({
      success: false,
      message: 'shared_guest',
      values: { email: 'attacker@example.com', phone: '' },
    });
    expect(sharedChecks).toEqual([{ id: expect.anything() }]);
    expect(fake.current?.updates).toEqual([]);
  });

  it('still lets a shared-row booking fix its own phone, which is per booking', async () => {
    // The form prefills and always posts the row's current email, so a
    // phone-only fix arrives with an unchanged (here re-cased) email.
    otherBookings = [{ id: 'b-victim' }];
    expect(
      await updateBookingContact(
        initial,
        form({ phone: '0512345678', email: 'First@Example.com' }),
      ),
    ).toEqual({ success: true });
    expect(sharedChecks).toEqual([]);
    expect(fake.current?.updates).toEqual([{ contactPhone: '+966512345678' }]);
  });

  it('writes the phone onto the booking and the email onto the anonymous guest row', async () => {
    expect(
      await updateBookingContact(initial, form({ email: 'Sara@Example.com', phone: '0512345678' })),
    ).toEqual({
      success: true,
    });
    expect(fake.current?.updates).toEqual([
      { email: 'sara@example.com' },
      { contactPhone: '+966512345678' },
    ]);
    // The email write re-applies the guards in its WHERE (account link
    // and shared row), so a race between the read and the write loses.
    // The subquery's exact SQL is pinned in shared-guest.render.test.ts.
    const emailWhere = fake.current?.updateConditions[0];
    expect(referencedColumns(emailWhere)).toEqual(expect.arrayContaining(['id', 'authUserId']));
    expect(rawChunksIn(emailWhere)).toContain('not exists ');
  });

  it('reports shared_guest, and saves nothing, when the guarded email write matches no row', async () => {
    // The read said "not shared", then a booking landed on the row (or an
    // account claimed it) before the write: the WHERE refuses, zero rows
    // change, and the guest must not be told the email was saved. The
    // phone write comes after the email so a refusal means nothing changed.
    guestRowsWritten = [];
    expect(
      await updateBookingContact(initial, form({ email: 'sara@example.com', phone: '0512345678' })),
    ).toEqual({
      success: false,
      message: 'shared_guest',
      values: { email: 'sara@example.com', phone: '0512345678' },
    });
    expect(fake.current?.updates).toEqual([{ email: 'sara@example.com' }]);
  });
});
