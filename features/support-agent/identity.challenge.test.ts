import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * The email challenge's database path (2026-09 engineering audit AI-13):
 * throttle first, compare against the address on file, record a failure
 * BEFORE answering, and stamp the conversation only for the guest that
 * was checked.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const throttle = vi.hoisted(() => ({ allowed: true, failures: 0 }));
vi.mock('@/features/auth/lib/throttle', () => ({
  otpVerifyAllowed: async () => throttle.allowed,
  recordOtpVerifyFailure: async () => {
    throttle.failures += 1;
  },
}));

let guest: { email: string | null; phone?: string | null } | undefined;
let failDb = false;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { attemptIdentityChallenge, readIdentityState } from './identity';

const input = {
  conversationId: 'c1',
  guestId: 'g1',
  address: '+966500000001',
  submittedEmail: 'Sara@Example.com ',
};

beforeEach(() => {
  throttle.allowed = true;
  throttle.failures = 0;
  guest = { email: 'sara@example.com' };
  failDb = false;
  fake.current = createDbFake({
    select: () => [{ verifiedAt: null, verifiedGuestId: null }],
    query: {
      guests: {
        findFirst: () => {
          if (failDb) throw new Error('pooler down');
          return guest;
        },
      },
    },
    update: () => [{ id: 'c1' }],
  });
});

/**
 * The read scope (#234, 2026-10-30): a number that is the guest row's own
 * phone reads the account; one that only matched a booking's contact
 * phone reads that booking alone. Recomputed every turn from the row.
 */
describe('readIdentityState — booking scope', () => {
  it("is the account when the sender is the guest row's own phone", async () => {
    guest = { email: 'sara@example.com', phone: '+966500000001' };
    const state = await readIdentityState('c1', 'g1', '+966500000001');
    expect(state.bookingScope).toBe('account');
    expect(state.hasEmail).toBe(true);
    expect(state.verified).toBe(false);
  });

  it('is one booking when the number only matched a contact phone', async () => {
    guest = { email: 'sara@example.com', phone: '+966500000001' };
    expect((await readIdentityState('c1', 'g1', '+966500000002')).bookingScope).toBe('contact');
  });

  it('is one booking for an email-only account with no phone at all', async () => {
    guest = { email: 'sara@example.com', phone: null };
    expect((await readIdentityState('c1', 'g1', '+966500000002')).bookingScope).toBe('contact');
  });

  it('is one booking for an unknown number', async () => {
    expect((await readIdentityState('c1', null, '+966500000002')).bookingScope).toBe('contact');
  });

  it('fails closed to one booking on a database error', async () => {
    failDb = true;
    const state = await readIdentityState('c1', 'g1', '+966500000001');
    expect(state).toMatchObject({ verified: false, hasEmail: false, bookingScope: 'contact' });
  });
});

describe('attemptIdentityChallenge', () => {
  it('is unavailable without a guest to check against', async () => {
    expect(await attemptIdentityChallenge({ ...input, guestId: null })).toBe('unavailable');
  });

  it('treats an empty submission as a mismatch without touching the throttle', async () => {
    expect(await attemptIdentityChallenge({ ...input, submittedEmail: '   ' })).toBe('mismatch');
    expect(throttle.failures).toBe(0);
  });

  it('refuses while the address is throttled', async () => {
    throttle.allowed = false;
    expect(await attemptIdentityChallenge(input)).toBe('throttled');
    expect(fake.current?.updates).toEqual([]);
  });

  it('reports when the guest has no email on file', async () => {
    guest = { email: null };
    expect(await attemptIdentityChallenge(input)).toBe('no_email_on_file');
  });

  it('records a throttle failure on a wrong answer and stamps nothing', async () => {
    expect(await attemptIdentityChallenge({ ...input, submittedEmail: 'other@example.com' })).toBe(
      'mismatch',
    );
    expect(throttle.failures).toBe(1);
    expect(fake.current?.updates).toEqual([]);
  });

  it('verifies a case- and space-insensitive match and stamps the conversation', async () => {
    expect(await attemptIdentityChallenge(input)).toBe('verified');
    expect(throttle.failures).toBe(0);
    expect(fake.current?.updates).toHaveLength(1);
    expect(fake.current?.updates[0]).toMatchObject({ identityVerifiedGuestId: 'g1' });
    expect(fake.current?.updates[0].identityVerifiedAt).toBeInstanceOf(Date);
  });

  it('fails safe to unavailable on a database error', async () => {
    failDb = true;
    expect(await attemptIdentityChallenge(input)).toBe('unavailable');
  });
});
