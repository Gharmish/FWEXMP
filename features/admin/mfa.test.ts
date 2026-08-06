import { describe, expect, it, vi } from 'vitest';

// `readAdminMfaState` touches the DB and the cookie store; these tests
// target the pure marker + requirement logic, so stub those modules out.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/db', () => ({ db: { query: {} } }));

import {
  mfaRequirement,
  serializeAdminMfaCookie,
  verifyAdminMfaMarker,
  type AdminMfaState,
} from './mfa';

const USER = 'e3e4b350-66a7-46a4-b9ee-6b8ec350b68a';
const OTHER_USER = '11111111-2222-4333-8444-555555555555';
const NOW = 1_800_000_000;

/**
 * The marker is the second factor made durable for a session. Forging or
 * extending one would defeat the whole feature, so the negative cases
 * matter more than the happy path.
 */
describe('admin MFA session marker', () => {
  it('accepts a marker it just minted for this user', () => {
    const marker = serializeAdminMfaCookie(USER, NOW + 3600)!;
    expect(verifyAdminMfaMarker(marker, USER, NOW)).toBe(true);
  });

  it("rejects another user's marker (user id is inside the signature)", () => {
    const marker = serializeAdminMfaCookie(OTHER_USER, NOW + 3600)!;
    expect(verifyAdminMfaMarker(marker, USER, NOW)).toBe(false);
  });

  it('rejects an expired marker', () => {
    const marker = serializeAdminMfaCookie(USER, NOW - 1)!;
    expect(verifyAdminMfaMarker(marker, USER, NOW)).toBe(false);
  });

  it('rejects an expiry extended by hand (expiry is signed)', () => {
    const marker = serializeAdminMfaCookie(USER, NOW - 1)!;
    const tag = marker.slice(marker.lastIndexOf('.') + 1);
    expect(verifyAdminMfaMarker(`${USER}:${NOW + 99999}.${tag}`, USER, NOW)).toBe(false);
  });

  it('rejects an unsigned or junk-tagged value', () => {
    expect(verifyAdminMfaMarker(`${USER}:${NOW + 3600}`, USER, NOW)).toBe(false);
    expect(verifyAdminMfaMarker(`${USER}:${NOW + 3600}.junk`, USER, NOW)).toBe(false);
    expect(verifyAdminMfaMarker(undefined, USER, NOW)).toBe(false);
    expect(verifyAdminMfaMarker('', USER, NOW)).toBe(false);
  });

  it('rejects a truncated tag', () => {
    const marker = serializeAdminMfaCookie(USER, NOW + 3600)!;
    expect(verifyAdminMfaMarker(marker.slice(0, -1), USER, NOW)).toBe(false);
  });
});

describe('mfaRequirement', () => {
  const state = (over: Partial<AdminMfaState>): AdminMfaState => ({
    enrolled: false,
    verified: false,
    ...over,
  });

  it('sends a first-time admin to enrolment', () => {
    expect(mfaRequirement(state({ enrolled: false, verified: false }))).toBe('enroll');
  });

  it('challenges an enrolled admin whose session has not verified', () => {
    expect(mfaRequirement(state({ enrolled: true, verified: false }))).toBe('verify');
  });

  it('lets a verified session through', () => {
    expect(mfaRequirement(state({ enrolled: true, verified: true }))).toBe('ok');
  });
});
