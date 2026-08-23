import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let configured = true;
vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: () => undefined }));
vi.mock('@/lib/env', () => ({
  hasTwilioVerify: () => configured,
  serverEnv: {
    TWILIO_ACCOUNT_SID: 'ACxxx',
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_VERIFY_SERVICE_SID: 'VAxxx',
  },
}));

import { checkPhoneVerification, startPhoneVerification } from '@/lib/twilio-verify';

const fetchMock = vi.fn();

function respond(status: number, json: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce({ status, json: async () => json });
}

beforeEach(() => {
  configured = true;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startPhoneVerification', () => {
  it('posts the WhatsApp channel + locale to the Verify service with basic auth', async () => {
    respond(201, { status: 'pending' });
    expect(await startPhoneVerification('+966559002592', 'ar')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verify.twilio.com/v2/Services/VAxxx/Verifications');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('ACxxx:secret').toString('base64')}`,
    );
    expect(String(init.body)).toBe('To=%2B966559002592&Channel=whatsapp&Locale=ar');
  });

  it('maps Twilio error codes to typed reasons', async () => {
    respond(400, { code: 60200, message: 'Invalid parameter' });
    expect(await startPhoneVerification('+1', 'en')).toEqual({
      ok: false,
      reason: 'invalid_phone',
    });
    respond(429, { code: 60203, message: 'Max send attempts reached' });
    expect(await startPhoneVerification('+966559002592', 'en')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    respond(500, { message: 'boom' });
    expect(await startPhoneVerification('+966559002592', 'en')).toEqual({
      ok: false,
      reason: 'provider',
    });
  });

  it('never throws on a transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await startPhoneVerification('+966559002592', 'en')).toEqual({
      ok: false,
      reason: 'provider',
    });
  });

  it('is a typed refusal when unconfigured', async () => {
    configured = false;
    expect(await startPhoneVerification('+966559002592', 'en')).toEqual({
      ok: false,
      reason: 'unconfigured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checkPhoneVerification', () => {
  it('approves only an `approved` status', async () => {
    respond(200, { status: 'approved' });
    expect(await checkPhoneVerification('+966559002592', '123456')).toEqual({ ok: true });
    respond(200, { status: 'pending' });
    expect(await checkPhoneVerification('+966559002592', '000000')).toEqual({
      ok: false,
      reason: 'invalid_code',
    });
  });

  it('reads a missing verification as expired and max attempts as rate-limited', async () => {
    respond(404, { code: 20404 });
    expect(await checkPhoneVerification('+966559002592', '123456')).toEqual({
      ok: false,
      reason: 'expired',
    });
    respond(429, { code: 60202 });
    expect(await checkPhoneVerification('+966559002592', '123456')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });
});
