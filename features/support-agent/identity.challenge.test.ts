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

let guest: { email: string | null } | undefined;
let failDb = false;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { attemptIdentityChallenge } from './identity';

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
