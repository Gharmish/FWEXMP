import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string; locale: string }) => {
    throw new Error(`REDIRECT:${args.locale}:${args.href}`);
  },
}));
const jar = vi.hoisted(() => ({
  values: {} as Record<string, string>,
  sets: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
  deletes: [] as string[],
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar.values ? { name, value: jar.values[name] } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.values[name] = value;
      jar.sets.push({ name, value, options });
    },
    delete: (name: string) => {
      delete jar.values[name];
      jar.deletes.push(name);
    },
  }),
}));
const env = vi.hoisted(() => ({ stub: false, supabase: true }));
vi.mock('@/lib/env', () => ({
  stubAuthAllowed: () => env.stub,
  hasSupabaseAuth: () => env.supabase,
}));
const supa = vi.hoisted(() => ({
  signInError: null as { status?: number; code?: string; name?: string } | null,
  verifyError: null as { status?: number } | null,
  session: { access_token: 't' } as object | null,
  calls: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: {
      signInWithOtp: async (input: Record<string, unknown>) => {
        supa.calls.push({ signIn: input });
        return { error: supa.signInError };
      },
      verifyOtp: async (input: Record<string, unknown>) => {
        supa.calls.push({ verify: input });
        return {
          data: { session: supa.verifyError ? null : supa.session },
          error: supa.verifyError,
        };
      },
      signOut: async () => {
        supa.calls.push({ signOut: true });
      },
    },
  }),
}));
const throttle = vi.hoisted(() => ({ sendAllowed: true, verifyAllowed: true }));
const recordSend = vi.fn(async () => undefined);
const recordFailure = vi.fn(async () => undefined);
vi.mock('@/features/auth/lib/throttle', () => ({
  authClientIp: async () => '203.0.113.9',
  otpSendAllowed: async () => throttle.sendAllowed,
  recordOtpSend: () => recordSend(),
  otpVerifyAllowed: async () => throttle.verifyAllowed,
  recordOtpVerifyFailure: () => recordFailure(),
}));

import { requestOtp, signOut, verifyOtp } from './actions';

const PHONE = '+966512345678';
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ locale: 'ar', ...fields })) fd.set(k, v);
  return fd;
};
const idle = { success: false as const, stage: 'phone' as const, method: 'phone' as const };
const run = async (fn: () => Promise<unknown>) => {
  try {
    return await fn();
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  jar.values = {};
  jar.sets.length = 0;
  jar.deletes.length = 0;
  env.stub = false;
  env.supabase = true;
  supa.signInError = null;
  supa.verifyError = null;
  supa.session = { access_token: 't' };
  supa.calls.length = 0;
  throttle.sendAllowed = true;
  throttle.verifyAllowed = true;
  recordSend.mockClear();
  recordFailure.mockClear();
});

describe('requestOtp (phone)', () => {
  it('flags an unusable number and echoes it', async () => {
    expect(await requestOtp(idle, form({ phone: '12' }))).toMatchObject({
      success: false,
      stage: 'phone',
      method: 'phone',
      message: 'validation',
      fields: { phone: 'invalid_phone' },
      phone: '12',
    });
    expect(supa.calls).toEqual([]);
  });

  it('honours the per-device cooldown and the server-side throttle before touching Supabase', async () => {
    jar.values.gharmish_otp_cooldown = String(Date.now());
    expect(await requestOtp(idle, form({ phone: PHONE }))).toMatchObject({
      message: 'rate_limited',
      phone: PHONE,
    });
    jar.values = {};
    throttle.sendAllowed = false;
    expect(await requestOtp(idle, form({ phone: PHONE }))).toMatchObject({
      message: 'rate_limited',
    });
    expect(supa.calls).toEqual([]);
  });

  it('sends over WhatsApp, records the send and stamps the cooldown', async () => {
    expect(await requestOtp(idle, form({ phone: PHONE }))).toEqual({
      success: true,
      stage: 'code',
      method: 'phone',
      phone: PHONE,
    });
    expect(supa.calls[0]).toEqual({ signIn: { phone: PHONE, options: { channel: 'whatsapp' } } });
    expect(recordSend).toHaveBeenCalledTimes(1);
    expect(jar.sets[0]).toMatchObject({
      name: 'gharmish_otp_cooldown',
      options: expect.objectContaining({ httpOnly: true, maxAge: 30 }),
    });
  });

  it('maps a gateway 429 to rate_limited and anything else to server', async () => {
    supa.signInError = { status: 429 };
    expect(await requestOtp(idle, form({ phone: PHONE }))).toMatchObject({
      message: 'rate_limited',
    });
    supa.signInError = { status: 500 };
    expect(await requestOtp(idle, form({ phone: PHONE }))).toMatchObject({ message: 'server' });
    expect(jar.sets).toEqual([]);
  });

  it('stub mode never calls the gateway', async () => {
    env.stub = true;
    expect(await requestOtp(idle, form({ method: 'email', email: 'Sara@Example.com' }))).toEqual({
      success: true,
      stage: 'code',
      method: 'email',
      email: 'sara@example.com',
    });
    expect(supa.calls).toEqual([]);
  });
});

describe('verifyOtp', () => {
  it('validates the code shape and honours the verify throttle', async () => {
    expect(await verifyOtp(idle, form({ phone: PHONE, code: '12' }))).toMatchObject({
      stage: 'code',
      message: 'validation',
      fields: { code: 'invalid_code' },
    });
    throttle.verifyAllowed = false;
    expect(await verifyOtp(idle, form({ phone: PHONE, code: '123456' }))).toMatchObject({
      message: 'rate_limited',
    });
    expect(supa.calls).toEqual([]);
  });

  it('a wrong code is recorded as a failure; a right one signs in and lands on a sanitised next path', async () => {
    supa.verifyError = { status: 401 };
    expect(await verifyOtp(idle, form({ phone: PHONE, code: '123456' }))).toMatchObject({
      message: 'invalid_code',
      fields: { code: 'invalid_code' },
      phone: PHONE,
    });
    expect(recordFailure).toHaveBeenCalledTimes(1);
    supa.verifyError = null;
    expect(
      await run(() =>
        verifyOtp(idle, form({ phone: PHONE, code: '123456', next: 'https://evil.example/x' })),
      ),
    ).toBe('REDIRECT:ar:/');
    expect(
      await run(() => verifyOtp(idle, form({ phone: PHONE, code: '123456', next: '/host' }))),
    ).toBe('REDIRECT:ar:/host');
    expect(supa.calls.at(-1)).toEqual({ verify: { phone: PHONE, token: '123456', type: 'sms' } });
  });

  it('stub mode accepts only the stub code and sets the stub session cookie', async () => {
    env.stub = true;
    expect(await verifyOtp(idle, form({ phone: PHONE, code: '111111' }))).toMatchObject({
      message: 'invalid_code',
    });
    expect(
      await run(() => verifyOtp(idle, form({ phone: PHONE, code: '000000', next: '/me' }))),
    ).toBe('REDIRECT:ar:/me');
    expect(jar.sets[0]).toMatchObject({
      name: 'gharmish_stub_session',
      value: PHONE,
      options: expect.objectContaining({ httpOnly: true }),
    });
  });
});

describe('signOut', () => {
  it('ends the Supabase session, clears both cookies and returns home in the locale', async () => {
    expect(await run(() => signOut(form({ locale: 'en' })))).toBe('REDIRECT:en:/');
    expect(supa.calls).toEqual([{ signOut: true }]);
    expect(jar.deletes).toEqual(['gharmish_stub_session', 'gharmish_admin_mfa']);
  });
});
