import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contact-phone change + notification preferences (2026-08-22).
 *
 * The rules under test:
 *  - a changed phone is PARKED (pendingContactPhone) and a code is sent;
 *    `contactPhone` is untouched until the code checks out;
 *  - an unchanged phone + changed email saves the email straight away;
 *  - a wrong code is refused and counted against the throttle; a right
 *    code promotes the pending number and clears the pending columns;
 *  - an expired pending change can't be confirmed;
 *  - preferences refuse "both channels off".
 */

const updates: Array<Record<string, unknown>> = [];
const inserts: Array<Record<string, unknown>> = [];
const notices: Array<Record<string, unknown>> = [];
let addresses: { email: string | null; phone: string | null } | null = null;
let hostRow: Record<string, unknown> | null = null;
let sendAllowed = true;
let verifyAllowed = true;
const sends: string[] = [];
const failures: string[] = [];
const verifyStart = vi.fn(async () => ({ ok: true as const }));
const verifyCheck = vi.fn(async () => ({ ok: true as const }));
let verifyConfigured = true;
let stub = false;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: () => undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasSupabaseAuth: () => true,
  hasTwilioVerify: () => verifyConfigured,
  stubAuthAllowed: () => stub,
}));
vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () => ({ id: 'user-1' }),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseUserStorage: async () => null }));
vi.mock('@/features/host-experiences/lib/photo', () => ({
  validatePhoto: () => ({ ok: true }),
  objectKeyFromPublicUrl: () => null,
}));
vi.mock('@/features/auth/lib/throttle', () => ({
  authClientIp: async () => '10.0.0.1',
  otpSendAllowed: async () => sendAllowed,
  otpVerifyAllowed: async () => verifyAllowed,
  recordOtpSend: async (id: string) => {
    sends.push(id);
  },
  recordOtpVerifyFailure: async (id: string) => {
    failures.push(id);
  },
}));
vi.mock('@/lib/twilio-verify', () => ({
  startPhoneVerification: (...args: unknown[]) => verifyStart(...(args as [])),
  checkPhoneVerification: (...args: unknown[]) => verifyCheck(...(args as [])),
}));
vi.mock('@/features/host-dashboard/queries', () => ({
  PENDING_PHONE_WINDOW_MS: 15 * 60 * 1000,
}));
vi.mock('@/lib/notifications/host-contact', () => ({
  hostContactAddresses: async () => addresses,
}));
vi.mock('@/features/host-profile/lib/contact-change-email', () => ({
  maskContact: (v: string | null) => (v ? `masked(${v})` : '—'),
  sendHostContactChangedEmail: async (
    hostId: string,
    change: Record<string, unknown>,
    recipients: Record<string, unknown>,
  ) => {
    notices.push({ hostId, ...change, ...recipients });
  },
}));
vi.mock('@/lib/db', () => ({
  db: {
    query: { hosts: { findFirst: async () => hostRow } },
    update: (table: { _tag?: string }) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ ...values, __table: table._tag ?? 'hosts' });
          return Promise.resolve(undefined);
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return Promise.resolve(undefined);
      },
    }),
  },
}));
vi.mock('@/db/schema', () => ({
  hosts: { _tag: 'hosts', id: 'hosts.id' },
  conversations: { _tag: 'conversations', address: 'c.address', hostId: 'c.hostId' },
  userProfileEvents: {},
}));

import {
  confirmHostContactPhone,
  resendHostContactPhoneCode,
  updateHostContact,
  updateHostNotificationPrefs,
} from '@/features/host-profile/actions';

const IDLE = { status: 'idle' as const };

function contactForm(phone: string, email: string) {
  const form = new FormData();
  form.set('contactPhone', phone);
  form.set('contactEmail', email);
  form.set('locale', 'en');
  return form;
}

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
  notices.length = 0;
  addresses = { email: 'host@example.com', phone: '+966541104000' };
  sends.length = 0;
  failures.length = 0;
  sendAllowed = true;
  verifyAllowed = true;
  verifyConfigured = true;
  stub = false;
  verifyStart.mockClear();
  verifyCheck.mockClear();
  hostRow = {
    id: 'host-1',
    slug: 'abdulaziz',
    photoUrl: null,
    verificationStatus: 'verified',
    contactPhone: '+966541104000',
    contactEmail: 'host@example.com',
    pendingContactPhone: null,
    pendingContactPhoneAt: null,
  };
});

describe('updateHostContact', () => {
  it('saves a changed email immediately when the phone is unchanged', async () => {
    const state = await updateHostContact(IDLE, contactForm('541104000', 'NEW@Example.com'));
    expect(state).toEqual({ status: 'success', message: 'saved' });
    expect(updates).toEqual([{ contactEmail: 'new@example.com', __table: 'hosts' }]);
    expect(verifyStart).not.toHaveBeenCalled();
    // Audited, and announced to the PREVIOUS address as well as the new one.
    expect(inserts).toEqual([
      expect.objectContaining({
        subjectHostId: 'host-1',
        actorUserId: 'user-1',
        field: 'host.contactEmail',
        previousValue: 'masked(host@example.com)',
        newValue: 'masked(new@example.com)',
      }),
    ]);
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'email',
        previousEmail: 'host@example.com',
        currentEmail: 'new@example.com',
      }),
    ]);
  });

  it('parks a changed phone, sends a code, and never writes contactPhone', async () => {
    const state = await updateHostContact(IDLE, contactForm('559002592', 'host@example.com'));
    expect(state).toEqual({ status: 'verify', phone: '+966559002592', emailSaved: false });
    expect(verifyStart).toHaveBeenCalledWith('+966559002592', 'en');
    expect(sends).toEqual(['+966559002592']);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ pendingContactPhone: '+966559002592' });
    expect(updates[0]).not.toHaveProperty('contactPhone');
  });

  it('saves the email AND parks the phone in one submit', async () => {
    const state = await updateHostContact(IDLE, contactForm('559002592', 'other@example.com'));
    expect(state).toMatchObject({ status: 'verify', emailSaved: true });
    expect(updates[0]).toMatchObject({ contactEmail: 'other@example.com' });
    expect(updates[1]).toMatchObject({ pendingContactPhone: '+966559002592' });
  });

  it('refuses a phone change when Verify is not configured (never saves unverified)', async () => {
    verifyConfigured = false;
    const state = await updateHostContact(IDLE, contactForm('559002592', 'host@example.com'));
    expect(state).toMatchObject({ status: 'error', message: 'verify_unavailable' });
    expect(updates).toEqual([]);
  });

  it('honours the send throttle before touching Twilio', async () => {
    sendAllowed = false;
    const state = await updateHostContact(IDLE, contactForm('559002592', 'host@example.com'));
    expect(state).toMatchObject({ status: 'error', message: 'rate_limited' });
    expect(verifyStart).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('tells the host the email part saved when the phone step then fails', async () => {
    sendAllowed = false;
    const state = await updateHostContact(IDLE, contactForm('559002592', 'other@example.com'));
    expect(state).toMatchObject({ status: 'error', message: 'rate_limited', emailSaved: true });
    expect(updates).toEqual([{ contactEmail: 'other@example.com', __table: 'hosts' }]);
  });

  it('maps a Twilio invalid-number refusal to phone_unreachable and parks nothing', async () => {
    verifyStart.mockResolvedValueOnce({ ok: false, reason: 'invalid_phone' } as never);
    const state = await updateHostContact(IDLE, contactForm('559002592', 'host@example.com'));
    expect(state).toMatchObject({ status: 'error', message: 'phone_unreachable' });
    expect(updates).toEqual([]);
  });

  it('echoes values on validation failure', async () => {
    const state = await updateHostContact(IDLE, contactForm('12', 'nope'));
    expect(state).toMatchObject({
      status: 'error',
      message: 'validation',
      fields: { contactPhone: true, contactEmail: true },
      values: { contactPhone: '12', contactEmail: 'nope' },
    });
  });
});

describe('confirmHostContactPhone', () => {
  const pending = () => {
    hostRow = {
      ...hostRow!,
      pendingContactPhone: '+966559002592',
      pendingContactPhoneAt: new Date(),
    };
  };
  const codeForm = (code: string) => {
    const form = new FormData();
    form.set('code', code);
    return form;
  };

  it('promotes the pending number on a correct code and clears the pending columns', async () => {
    pending();
    const state = await confirmHostContactPhone(IDLE, codeForm('123456'));
    expect(state).toEqual({ status: 'success', message: 'phone_verified' });
    expect(verifyCheck).toHaveBeenCalledWith('+966559002592', '123456');
    expect(updates[0]).toEqual({
      contactPhone: '+966559002592',
      pendingContactPhone: null,
      pendingContactPhoneAt: null,
      __table: 'hosts',
    });
    // The OLD number loses its WhatsApp host identity the moment the new one takes over.
    expect(updates[1]).toEqual({ hostId: null, __table: 'conversations' });
    expect(inserts).toEqual([
      expect.objectContaining({
        field: 'host.contactPhone',
        previousValue: 'masked(+966541104000)',
        newValue: 'masked(+966559002592)',
      }),
    ]);
    expect(notices).toEqual([
      expect.objectContaining({ kind: 'phone', previousEmail: 'host@example.com' }),
    ]);
  });

  it('accepts Arabic-Indic digits in the code', async () => {
    pending();
    const state = await confirmHostContactPhone(IDLE, codeForm('١٢٣٤٥٦'));
    expect(state).toEqual({ status: 'success', message: 'phone_verified' });
    expect(verifyCheck).toHaveBeenCalledWith('+966559002592', '123456');
  });

  it('refuses a wrong code, counts it against the throttle, keeps the step open', async () => {
    pending();
    verifyCheck.mockResolvedValueOnce({ ok: false, reason: 'invalid_code' } as never);
    const state = await confirmHostContactPhone(IDLE, codeForm('000001'));
    expect(state).toMatchObject({
      status: 'error',
      message: 'invalid_code',
      step: 'verify',
      phone: '+966559002592',
    });
    expect(failures).toEqual(['+966559002592']);
    expect(updates).toEqual([]);
  });

  it('refuses a malformed code without calling Twilio', async () => {
    pending();
    const state = await confirmHostContactPhone(IDLE, codeForm('12'));
    expect(state).toMatchObject({ status: 'error', message: 'invalid_code', step: 'verify' });
    expect(verifyCheck).not.toHaveBeenCalled();
  });

  it('answers expired when the pending change is older than the window, and clears it', async () => {
    hostRow = {
      ...hostRow!,
      pendingContactPhone: '+966559002592',
      pendingContactPhoneAt: new Date(Date.now() - 16 * 60 * 1000),
    };
    const state = await confirmHostContactPhone(IDLE, codeForm('123456'));
    expect(state).toMatchObject({ status: 'error', message: 'expired' });
    expect(verifyCheck).not.toHaveBeenCalled();
    expect(updates).toEqual([
      { pendingContactPhone: null, pendingContactPhoneAt: null, __table: 'hosts' },
    ]);
  });

  it('keeps the step open when Twilio says the code itself expired (host can resend)', async () => {
    pending();
    verifyCheck.mockResolvedValueOnce({ ok: false, reason: 'expired' } as never);
    const state = await confirmHostContactPhone(IDLE, codeForm('123456'));
    expect(state).toMatchObject({ status: 'error', message: 'expired', step: 'verify' });
  });

  it('stops after too many wrong codes', async () => {
    pending();
    verifyAllowed = false;
    const state = await confirmHostContactPhone(IDLE, codeForm('123456'));
    expect(state).toMatchObject({ status: 'error', message: 'rate_limited' });
    expect(verifyCheck).not.toHaveBeenCalled();
  });

  it('accepts the stub code when stub auth is on (local dev) and nothing else', async () => {
    stub = true;
    pending();
    expect(await confirmHostContactPhone(IDLE, codeForm('111111'))).toMatchObject({
      message: 'invalid_code',
    });
    expect(await confirmHostContactPhone(IDLE, codeForm('000000'))).toEqual({
      status: 'success',
      message: 'phone_verified',
    });
    expect(verifyCheck).not.toHaveBeenCalled();
  });
});

describe('resendHostContactPhoneCode', () => {
  it('re-sends to the parked number and restarts the window', async () => {
    hostRow = { ...hostRow!, pendingContactPhone: '+966559002592' };
    const form = new FormData();
    form.set('locale', 'ar');
    const state = await resendHostContactPhoneCode(IDLE, form);
    expect(state).toEqual({
      status: 'verify',
      phone: '+966559002592',
      emailSaved: false,
      resent: true,
    });
    expect(verifyStart).toHaveBeenCalledWith('+966559002592', 'ar');
    expect(updates[0]).toMatchObject({ pendingContactPhone: '+966559002592' });
  });

  it('answers expired when nothing is parked', async () => {
    const form = new FormData();
    expect(await resendHostContactPhoneCode(IDLE, form)).toMatchObject({ message: 'expired' });
    expect(verifyStart).not.toHaveBeenCalled();
  });
});

describe('updateHostNotificationPrefs', () => {
  const prefsForm = (on: string[]) => {
    const form = new FormData();
    for (const key of on) form.set(key, 'on');
    return form;
  };

  it('saves the four toggles, audits, and announces a channel change by email', async () => {
    hostRow = {
      ...hostRow!,
      notifyEmail: true,
      notifyWhatsapp: true,
      notifyReminders: true,
      notifyReviews: true,
    };
    const state = await updateHostNotificationPrefs(IDLE, prefsForm(['whatsapp', 'reviews']));
    expect(state).toEqual({ status: 'success' });
    expect(updates).toEqual([
      {
        notifyEmail: false,
        notifyWhatsapp: true,
        notifyReminders: false,
        notifyReviews: true,
        __table: 'hosts',
      },
    ]);
    expect(inserts).toEqual([expect.objectContaining({ field: 'host.notificationPrefs' })]);
    expect(notices).toEqual([expect.objectContaining({ kind: 'prefs' })]);
  });

  it('refuses both channels off', async () => {
    const state = await updateHostNotificationPrefs(IDLE, prefsForm(['reminders']));
    expect(state).toMatchObject({ status: 'error', message: 'channel_required' });
    expect(updates).toEqual([]);
  });

  it('refuses a kept-on channel that has no address on file', async () => {
    addresses = { email: 'host@example.com', phone: null };
    const state = await updateHostNotificationPrefs(IDLE, prefsForm(['whatsapp']));
    expect(state).toMatchObject({ status: 'error', message: 'channel_unreachable' });
    expect(updates).toEqual([]);
  });
});
