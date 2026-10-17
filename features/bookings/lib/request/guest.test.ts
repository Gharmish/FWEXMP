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

vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => null }));
vi.mock('@/features/account/profile/guest-identity', () => ({
  isUniqueViolation: () => false,
  resolveGuestForUser: vi.fn(),
}));

type Row = Record<string, unknown>;
let guestRow: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { resolveBookingGuest } from './guest';
import type { BookingRequestInput } from './form';

const input = {
  name: 'Sara',
  phone: '+966512345678',
  email: 'sara@example.com',
  locale: 'en',
  marketingConsent: false,
} as unknown as BookingRequestInput;

function anonymousRow(over: Row = {}): Row {
  return {
    id: 'g1',
    authUserId: null,
    phone: '+966512345678',
    email: null,
    suspendedAt: null,
    ...over,
  };
}

beforeEach(() => {
  guestRow = anonymousRow();
  fake.current = createDbFake({ query: { guests: { findFirst: () => guestRow } } });
});

describe('resolveBookingGuest — signed-out email backfill (#120)', () => {
  it('backfills a missing email set-if-empty, guarded in the WHERE against a shared row', async () => {
    const out = await resolveBookingGuest(input);
    expect(out).toMatchObject({ guest: { id: 'g1' } });
    expect(fake.current?.updates).toEqual([{ email: 'sara@example.com' }]);
    // The guard lives in the write itself so two first bookings racing
    // onto a fresh row cannot both pass a read; the rendered SQL is
    // pinned in shared-guest.render.test.ts.
    const where = fake.current?.updateConditions[0];
    expect(referencedColumns(where)).toEqual(expect.arrayContaining(['id', 'email', 'authUserId']));
    expect(rawChunksIn(where)).toContain('not exists ');
  });

  it('leaves an existing email alone', async () => {
    guestRow = anonymousRow({ email: 'first@example.com' });
    await resolveBookingGuest(input);
    expect(fake.current?.updates).toEqual([]);
  });

  it('still stamps the phone and consent on the row in their own write', async () => {
    guestRow = anonymousRow({ phone: null, email: 'first@example.com' });
    await resolveBookingGuest({ ...input, marketingConsent: true });
    expect(fake.current?.updates).toEqual([
      { phone: '+966512345678', marketingConsentAt: expect.any(Date) },
    ]);
  });
});
