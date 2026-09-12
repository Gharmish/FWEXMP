import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const cookieSet = vi.fn();
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test', NODE_ENV: 'test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const who = vi.hoisted(() => ({
  user: {
    id: 'u-admin',
    phone: '+966500000000',
    email: null,
    isStub: false,
    isAdmin: true,
  } as Record<string, unknown> | null,
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/features/auth/lib/admin-user', () => ({
  isAdminUser: (u: { isAdmin?: boolean }) => Boolean(u?.isAdmin),
}));
vi.mock('@/lib/pii-crypto', () => ({
  encryptPii: (v: string) => `enc:${v}`,
  decryptPii: (v: string) => v.replace(/^enc:/, ''),
}));
const totp = vi.hoisted(() => ({ valid: true, step: 100 as number | undefined }));
vi.mock('@/lib/totp', () => ({
  generateTotpSecret: () => 'SECRET',
  totpUri: ({ account }: { account: string }) => `otpauth://totp/Gharmish:${account}`,
  verifyTotp: () => ({ valid: totp.valid, step: totp.step }),
}));
vi.mock('@/features/auth/lib/admin-mfa', () => ({
  ADMIN_MFA_COOKIE: 'gharmish_admin_mfa',
  ADMIN_MFA_TTL_SECONDS: 43_200,
  serializeAdminMfaCookie: (userId: string, exp: number) => `${userId}|${exp}|sig`,
}));
const throttle = vi.hoisted(() => ({ allowed: true }));
const recordFailure = vi.fn(async () => undefined);
vi.mock('@/features/auth/lib/throttle', () => ({
  authClientIp: async () => '203.0.113.9',
  otpVerifyAllowed: async () => throttle.allowed,
  recordOtpVerifyFailure: () => recordFailure(),
}));

type Row = Record<string, unknown>;
let factor: Row | undefined;
let claimed: Row[] = [{ userId: 'u-admin' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { startAdminMfaEnrollment, verifyAdminMfa } from './mfa-actions';

const codeForm = (code: string) => {
  const fd = new FormData();
  fd.set('code', code);
  return fd;
};

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  who.user = { id: 'u-admin', phone: '+966500000000', email: null, isStub: false, isAdmin: true };
  factor = { secret: 'enc:SECRET', lastUsedStep: 50, confirmedAt: new Date('2026-08-01') };
  claimed = [{ userId: 'u-admin' }];
  totp.valid = true;
  totp.step = 100;
  throttle.allowed = true;
  cookieSet.mockClear();
  recordFailure.mockClear();
  fake.current = createDbFake({
    query: { adminTotpFactors: { findFirst: () => factor } },
    update: () => claimed,
  });
});

describe('startAdminMfaEnrollment', () => {
  it('is forbidden for non-admins and unavailable for stub sessions or without a database', async () => {
    who.user = { id: 'u', isAdmin: false };
    expect(await startAdminMfaEnrollment()).toEqual({ status: 'error', message: 'forbidden' });
    who.user = { id: 'u-admin', isAdmin: true, isStub: true };
    expect(await startAdminMfaEnrollment()).toEqual({ status: 'error', message: 'unavailable' });
  });

  it('never re-issues a secret for a confirmed factor', async () => {
    expect(await startAdminMfaEnrollment()).toEqual({ status: 'error', message: 'forbidden' });
    expect(fake.current?.inserts).toEqual([]);
  });

  it('stores an encrypted secret and hands back the QR + secret for an unconfirmed factor', async () => {
    factor = undefined;
    const out = await startAdminMfaEnrollment();
    expect(out).toMatchObject({
      status: 'ready',
      secret: 'SECRET',
      qrCode: expect.stringContaining('data:image/png'),
    });
    expect(fake.current?.inserts[0]).toEqual({ userId: 'u-admin', secret: 'enc:SECRET' });
  });
});

describe('verifyAdminMfa', () => {
  const initial = { status: 'idle' as const };

  it('needs six digits, an open throttle and an enrolled factor', async () => {
    expect(await verifyAdminMfa(initial, codeForm('12'))).toEqual({
      status: 'error',
      message: 'invalid_code',
    });
    throttle.allowed = false;
    expect(await verifyAdminMfa(initial, codeForm('123456'))).toEqual({
      status: 'error',
      message: 'throttled',
    });
    throttle.allowed = true;
    factor = undefined;
    expect(await verifyAdminMfa(initial, codeForm('123456'))).toEqual({
      status: 'error',
      message: 'no_factor',
    });
  });

  it('a wrong code and a replayed step both count as failures and set no cookie', async () => {
    totp.valid = false;
    expect(await verifyAdminMfa(initial, codeForm('12 34 56'))).toEqual({
      status: 'error',
      message: 'invalid_code',
    });
    totp.valid = true;
    claimed = []; // lastUsedStep >= this step → the conditional UPDATE loses
    expect(await verifyAdminMfa(initial, codeForm('123456'))).toEqual({
      status: 'error',
      message: 'invalid_code',
    });
    expect(recordFailure).toHaveBeenCalledTimes(2);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('a fresh valid code claims the step, confirms the factor and sets the session marker', async () => {
    factor = { secret: 'enc:SECRET', lastUsedStep: null, confirmedAt: null };
    expect(await verifyAdminMfa(initial, codeForm('123456'))).toEqual({ status: 'ok' });
    expect(fake.current?.updates[0]).toMatchObject({ lastUsedStep: 100 });
    expect(fake.current?.updates[0]?.confirmedAt).toBeInstanceOf(Date);
    expect(cookieSet).toHaveBeenCalledWith(
      'gharmish_admin_mfa',
      expect.stringMatching(/^u-admin\|\d+\|sig$/),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', maxAge: 43_200 }),
    );
  });
});
