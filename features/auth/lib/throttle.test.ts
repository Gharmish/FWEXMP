import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * The fake answers each `select({ n: count() })` in call order; the
 * throttle reads identifier+IP, then IP, then identifier (see the
 * doc comment on `otpVerifyAllowed`).
 */
const state = vi.hoisted(() => ({ counts: [] as number[], dbUrl: 'postgres://x' as string }));
const dbFake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/db', () => ({
  get db() {
    return dbFake.current;
  },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    get DATABASE_URL() {
      return state.dbUrl;
    },
  },
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
}));

import {
  authClientIp,
  otpVerifyAllowed,
  recordOtpVerifyFailure,
  verifyLockedOut,
} from './throttle';

beforeEach(() => {
  state.counts = [];
  state.dbUrl = 'postgres://x';
  dbFake.current = createDbFake({ select: () => [{ n: state.counts.shift() ?? 0 }] });
});

describe('verifyLockedOut (pure decision)', () => {
  it('locks on ten failures for the same identifier from the same IP', () => {
    expect(verifyLockedOut({ byIdentifierIp: 9, byIp: 9, byIdentifier: 9 })).toBe(false);
    expect(verifyLockedOut({ byIdentifierIp: 10, byIp: 10, byIdentifier: 10 })).toBe(true);
  });

  it("a stranger's failures from another IP do not lock the identifier until the wide backstop", () => {
    // Victim's own counter is clean; 39 failures came from elsewhere.
    expect(verifyLockedOut({ byIdentifierIp: 0, byIp: 0, byIdentifier: 39 })).toBe(false);
    expect(verifyLockedOut({ byIdentifierIp: 0, byIp: 0, byIdentifier: 40 })).toBe(true);
  });

  it('locks an IP that sprays guesses across identifiers', () => {
    expect(verifyLockedOut({ byIdentifierIp: 1, byIp: 29, byIdentifier: 1 })).toBe(false);
    expect(verifyLockedOut({ byIdentifierIp: 1, byIp: 30, byIdentifier: 1 })).toBe(true);
  });

  it('falls back to the strict per-identifier ceiling when the IP is unknown', () => {
    expect(verifyLockedOut({ byIdentifierIp: null, byIp: null, byIdentifier: 9 })).toBe(false);
    expect(verifyLockedOut({ byIdentifierIp: null, byIp: null, byIdentifier: 10 })).toBe(true);
  });
});

describe('otpVerifyAllowed', () => {
  it('allows when every window count is under its ceiling', async () => {
    state.counts = [3, 5, 12];
    expect(await otpVerifyAllowed('+966500000000', '203.0.113.9')).toBe(true);
    // All three counts were read.
    expect(state.counts).toEqual([]);
  });

  it('refuses on the identifier+IP ceiling without reading the wider counts', async () => {
    state.counts = [10, 0, 0];
    expect(await otpVerifyAllowed('+966500000000', '203.0.113.9')).toBe(false);
    expect(state.counts).toEqual([0, 0]);
  });

  it("does not let another IP's failures lock the identifier below the backstop", async () => {
    // identifier+IP = 0 (the victim), IP = 0, identifier = 25 (the stranger's guesses).
    state.counts = [0, 0, 25];
    expect(await otpVerifyAllowed('+966500000000', '203.0.113.9')).toBe(true);
  });

  it('with no caller IP, applies the strict per-identifier ceiling', async () => {
    state.counts = [10];
    expect(await otpVerifyAllowed('+966500000000', null)).toBe(false);
    state.counts = [9];
    expect(await otpVerifyAllowed('+966500000000', null)).toBe(true);
  });

  it('degrades open without a database and on a database error', async () => {
    state.dbUrl = '';
    expect(await otpVerifyAllowed('+966500000000', '203.0.113.9')).toBe(true);
    state.dbUrl = 'postgres://x';
    dbFake.current = createDbFake({
      select: () => {
        throw new Error('boom');
      },
    });
    expect(await otpVerifyAllowed('+966500000000', '203.0.113.9')).toBe(true);
  });
});

describe('recordOtpVerifyFailure / authClientIp', () => {
  it('records the identifier, the IP and the verify_failed kind', async () => {
    const fake = createDbFake();
    dbFake.current = fake;
    await recordOtpVerifyFailure('+966500000000', '203.0.113.9');
    expect(fake.inserts).toEqual([
      { identifier: '+966500000000', ip: '203.0.113.9', kind: 'verify_failed' },
    ]);
  });

  it('reads the first x-forwarded-for hop', async () => {
    expect(await authClientIp()).toBe('203.0.113.9');
  });
});
