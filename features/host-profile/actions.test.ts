import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ar-placeholder', () => ({ AR_PLACEHOLDER: 'TODO(ar): pending translation' }));
const env = vi.hoisted(() => ({
  DATABASE_URL: 'postgres://test',
  supabase: true,
  twilio: true,
  stub: true,
}));
vi.mock('@/lib/env', () => ({
  serverEnv: env,
  hasSupabaseAuth: () => env.supabase,
  hasTwilioVerify: () => env.twilio,
  stubAuthAllowed: () => env.stub,
}));
vi.mock('@/lib/twilio-verify', () => ({
  startPhoneVerification: async () => ({ ok: true }),
  checkPhoneVerification: async () => ({ ok: true }),
}));
vi.mock('@/features/auth/lib/stub-session', () => ({ STUB_OTP: '000000' }));
const throttle = vi.hoisted(() => ({ sendAllowed: true, verifyAllowed: true }));
const recordFailure = vi.fn(async () => undefined);
vi.mock('@/features/auth/lib/throttle', () => ({
  authClientIp: async () => '203.0.113.9',
  otpSendAllowed: async () => throttle.sendAllowed,
  recordOtpSend: async () => undefined,
  otpVerifyAllowed: async () => throttle.verifyAllowed,
  recordOtpVerifyFailure: () => recordFailure(),
}));
vi.mock('@/features/host-dashboard/queries', () => ({ PENDING_PHONE_WINDOW_MS: 10 * 60_000 }));
const addresses = vi.hoisted(() => ({
  value: { email: 'host@example.com', phone: '+966500000000' } as {
    email: string | null;
    phone: string | null;
  } | null,
}));
vi.mock('@/lib/notifications/host-contact', () => ({
  hostContactAddresses: async () => addresses.value,
}));
const contactEmail = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/features/host-profile/lib/contact-change-email', () => ({
  maskContact: (v: string | null) => (v ? `masked(${v.slice(-4)})` : '—'),
  sendHostContactChangedEmail: (...a: unknown[]) => contactEmail(...a),
}));
const who = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
const storage = vi.hoisted(() => ({ uploaded: [] as string[], removed: [] as string[][] }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseUserStorage: async () => ({
    from: () => ({
      upload: async (key: string) => {
        storage.uploaded.push(key);
        return { error: null };
      },
      getPublicUrl: (key: string) => ({
        data: { publicUrl: `https://x/storage/v1/object/public/photos/${key}` },
      }),
      remove: async (keys: string[]) => {
        storage.removed.push(keys);
        return { error: null };
      },
    }),
  }),
}));

type Row = Record<string, unknown>;
let host: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import {
  cancelHostContactPhoneChange,
  confirmHostContactPhone,
  removeHostPhoto,
  updateHostContact,
  updateHostNotificationPrefs,
  updateHostPhoto,
  updateHostProfile,
} from './actions';

const form = (fields: Record<string, string | File>, multi: Record<string, string[]> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const [k, vs] of Object.entries(multi)) for (const v of vs) fd.append(k, v);
  return fd;
};
const idle = { status: 'idle' as const };
const BIO = 'A roaster who has poured coffee in the old town for twenty years now.';

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  env.supabase = true;
  env.twilio = true;
  env.stub = true;
  throttle.sendAllowed = true;
  throttle.verifyAllowed = true;
  who.user = { id: 'u1' };
  addresses.value = { email: 'host@example.com', phone: '+966500000000' };
  recordFailure.mockClear();
  contactEmail.mockClear();
  storage.uploaded.length = 0;
  storage.removed.length = 0;
  host = {
    id: 'h1',
    slug: 'sara-coffee',
    photoUrl: 'https://x/storage/v1/object/public/photos/hosts/sara-coffee/profile.jpg',
    verificationStatus: 'verified',
    contactPhone: '+966500000000',
    contactEmail: 'host@example.com',
    pendingContactPhone: null,
    pendingContactPhoneAt: null,
    notifyEmail: true,
    notifyWhatsapp: true,
    notifyReminders: true,
    notifyReviews: true,
  };
  fake.current = createDbFake({ query: { hosts: { findFirst: () => host } } });
});

describe('updateHostProfile / photo', () => {
  it('flags short copy, echoes values, and needs a non-suspended host', async () => {
    expect(
      await updateHostProfile(
        idle,
        form({ name: 'S', bioEn: 'short', storyEn: 'x'.repeat(10) }, { languages: ['ar'] }),
      ),
    ).toMatchObject({
      status: 'error',
      message: 'validation',
      fields: { name: true, bioEn: true, storyEn: true },
      values: { name: 'S', languages: ['ar'] },
    });
    host = { ...host, verificationStatus: 'suspended' };
    expect(
      await updateHostProfile(idle, form({ name: 'Sara', bioEn: BIO }, { languages: ['ar'] })),
    ).toMatchObject({ message: 'no_auth' });
  });

  it('writes the profile, keeping a blank Arabic bio as the placeholder and blank stories as null', async () => {
    expect(
      await updateHostProfile(
        idle,
        form(
          { name: 'Sara', bioEn: BIO, bioAr: '', storyEn: '', storyAr: '' },
          { languages: ['ar', 'en'] },
        ),
      ),
    ).toEqual({ status: 'success' });
    expect(fake.current?.updates[0]).toEqual({
      name: 'Sara',
      bioEn: BIO,
      bioAr: 'TODO(ar): pending translation',
      storyEn: null,
      storyAr: null,
      languages: ['ar', 'en'],
    });
  });

  it('uploads the profile photo under the host slug and removes it on request', async () => {
    expect(await updateHostPhoto(idle, form({}))).toEqual({ status: 'error', message: 'no_file' });
    const out = await updateHostPhoto(
      idle,
      form({ photo: new File([new Uint8Array(10)], 'p.jpg', { type: 'image/jpeg' }) }),
    );
    expect(out).toMatchObject({
      status: 'success',
      photoUrl: expect.stringMatching(/hosts\/sara-coffee\/profile\.jpg\?v=\d+$/),
    });
    expect(storage.uploaded).toEqual(['hosts/sara-coffee/profile.jpg']);
    expect(await removeHostPhoto()).toEqual({ status: 'success', photoUrl: null });
    expect(storage.removed).toEqual([['hosts/sara-coffee/profile.jpg']]);
  });
});

describe('contact details', () => {
  it('validates both fields and echoes them', async () => {
    expect(
      await updateHostContact(idle, form({ contactPhone: '', contactEmail: 'nope' })),
    ).toMatchObject({
      message: 'validation',
      fields: { contactPhone: true, contactEmail: true },
      values: { contactEmail: 'nope' },
    });
  });

  it('an email-only change saves at once, journals masked values and notifies both addresses', async () => {
    expect(
      await updateHostContact(
        idle,
        form({ contactPhone: '+966500000000', contactEmail: 'New@Example.com' }),
      ),
    ).toEqual({ status: 'success', message: 'saved' });
    expect(fake.current?.updates[0]).toEqual({ contactEmail: 'new@example.com' });
    expect(fake.current?.inserts[0]).toMatchObject({
      subjectHostId: 'h1',
      field: 'host.contactEmail',
      newValue: 'masked(.com)',
    });
    expect(contactEmail).toHaveBeenCalledWith('h1', expect.objectContaining({ kind: 'email' }), {
      previousEmail: 'host@example.com',
      currentEmail: 'new@example.com',
    });
  });

  it('a phone change stamps a pending number and asks for the code; the throttle can refuse', async () => {
    throttle.sendAllowed = false;
    expect(
      await updateHostContact(
        idle,
        form({ contactPhone: '+966512345678', contactEmail: 'host@example.com' }),
      ),
    ).toMatchObject({ message: 'rate_limited', emailSaved: false });
    throttle.sendAllowed = true;
    expect(
      await updateHostContact(
        idle,
        form({ contactPhone: '+966512345678', contactEmail: 'host@example.com' }),
      ),
    ).toEqual({ status: 'verify', phone: '+966512345678', emailSaved: false });
    expect(fake.current?.updates[0]).toMatchObject({ pendingContactPhone: '+966512345678' });
  });

  it('confirming needs a live pending number and the right code, then relinks the WhatsApp thread', async () => {
    expect(await confirmHostContactPhone(idle, form({ code: '000000' }))).toMatchObject({
      message: 'expired',
    });
    host = {
      ...host,
      pendingContactPhone: '+966512345678',
      pendingContactPhoneAt: new Date(Date.now() - 60 * 60_000),
    };
    expect(await confirmHostContactPhone(idle, form({ code: '000000' }))).toMatchObject({
      message: 'expired',
    });
    expect(fake.current?.updates[0]).toEqual({
      pendingContactPhone: null,
      pendingContactPhoneAt: null,
    });
    host = { ...host, pendingContactPhone: '+966512345678', pendingContactPhoneAt: new Date() };
    expect(await confirmHostContactPhone(idle, form({ code: '١٢٣٤٥٦' }))).toMatchObject({
      message: 'invalid_code',
      step: 'verify',
      phone: '+966512345678',
    });
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(await confirmHostContactPhone(idle, form({ code: '000000' }))).toEqual({
      status: 'success',
      message: 'phone_verified',
    });
    const writes = fake.current?.updates ?? [];
    expect(writes.at(-2)).toEqual({
      contactPhone: '+966512345678',
      pendingContactPhone: null,
      pendingContactPhoneAt: null,
    });
    expect(writes.at(-1)).toEqual({ hostId: null });
    expect(contactEmail).toHaveBeenCalledWith(
      'h1',
      expect.objectContaining({ kind: 'phone' }),
      expect.anything(),
    );
    expect(await cancelHostContactPhoneChange()).toEqual({
      status: 'success',
      message: 'cancelled',
    });
  });
});

describe('updateHostNotificationPrefs', () => {
  it('keeps at least one reachable channel on', async () => {
    expect(await updateHostNotificationPrefs(idle, form({ reminders: 'on' }))).toMatchObject({
      message: 'channel_required',
    });
    addresses.value = { email: null, phone: '+966500000000' };
    expect(await updateHostNotificationPrefs(idle, form({ email: 'on' }))).toMatchObject({
      message: 'channel_unreachable',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('writes the flags, journals a summary and emails only when a channel changed', async () => {
    expect(
      await updateHostNotificationPrefs(idle, form({ email: 'on', whatsapp: 'on', reviews: 'on' })),
    ).toEqual({ status: 'success' });
    expect(fake.current?.updates[0]).toEqual({
      notifyEmail: true,
      notifyWhatsapp: true,
      notifyReminders: false,
      notifyReviews: true,
    });
    expect(fake.current?.inserts[0]).toMatchObject({
      field: 'host.notificationPrefs',
      newValue: 'email:on whatsapp:on reminders:off reviews:on',
    });
    expect(contactEmail).not.toHaveBeenCalled();
    expect(await updateHostNotificationPrefs(idle, form({ email: 'on' }))).toEqual({
      status: 'success',
    });
    expect(contactEmail).toHaveBeenCalledWith(
      'h1',
      expect.objectContaining({ kind: 'prefs' }),
      expect.anything(),
    );
  });
});
