import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';

/**
 * The OPPWA webhook is the fast path that turns a paid-during-3DS booking
 * into `paid`. Its status codes control provider retries: 503 unconfigured,
 * 400 malformed, 401 (+ one quiet-windowed page) on a body that fails the
 * GCM tag, ACK for non-payment types and permanent anomalies, 500 only for
 * a transient settle error (2026-09 engineering audit TEST-05). The
 * receipt goes out AFTER the ack (GAPB-02), and a successful capture on a
 * superseded checkout is named to a human (MONEY-03).
 */

vi.mock('server-only', () => ({}));

const SECRET = 'a'.repeat(64);
const env = vi.hoisted(() => ({ HYPERPAY_WEBHOOK_SECRET: 'a'.repeat(64) }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));
const notifyAdmin = vi.fn(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...(args as [])),
}));

let settleOutcome = 'success';
const settleBooking = vi.fn(async () => settleOutcome);
vi.mock('@/features/payments/settle', () => ({
  settleBooking: (...args: unknown[]) => settleBooking(...(args as [])),
}));
const sendBookingReceiptEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingReceiptEmail: (...args: unknown[]) => sendBookingReceiptEmail(...(args as [])),
}));
vi.mock('@/features/bookings/queries', () => ({
  getBookingByReference: async () => ({ id: 'b-1' }),
}));
let currentCheckoutId: string | null = 'chk-current';
vi.mock('@/features/payments/queries', () => ({
  getCheckoutIdForReference: async () => currentCheckoutId,
}));
vi.mock('@/features/payments/lib/hyperpay', () => ({
  isSuccessfulResult: (code: string) => code.startsWith('000.000.'),
}));
// after() needs a request store; run the callback inline instead.
const afterCalls: Array<() => Promise<unknown> | unknown> = [];
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (fn: () => Promise<unknown> | unknown) => {
      afterCalls.push(fn);
    },
  };
});

import { POST } from './route';

const REFERENCE = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';

function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(SECRET, 'hex'), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedBody: body.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

function request(payload: unknown, opts: { iv?: string; authTag?: string; body?: string } = {}) {
  const enc = encrypt(JSON.stringify(payload));
  return new NextRequest('http://localhost/api/webhooks/hyperpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-initialization-vector': opts.iv ?? enc.iv,
      'x-authentication-tag': opts.authTag ?? enc.authTag,
    },
    body: JSON.stringify({ encryptedBody: opts.body ?? enc.encryptedBody }),
  });
}

const payment = (extra: Record<string, unknown> = {}) => ({
  type: 'PAYMENT',
  payload: {
    merchantTransactionId: REFERENCE,
    ndc: 'chk-current',
    result: { code: '000.000.000' },
    ...extra,
  },
});

beforeEach(() => {
  env.HYPERPAY_WEBHOOK_SECRET = SECRET;
  settleOutcome = 'success';
  currentCheckoutId = 'chk-current';
  afterCalls.length = 0;
  vi.clearAllMocks();
});

describe('POST /api/webhooks/hyperpay', () => {
  it('is 503 until the shared secret is configured', async () => {
    env.HYPERPAY_WEBHOOK_SECRET = '';
    expect((await POST(request(payment()))).status).toBe(503);
  });

  it('is 400 when the IV or tag header is missing', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/webhooks/hyperpay', {
        method: 'POST',
        body: JSON.stringify({ encryptedBody: 'ab' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('is 401 and pages once (quiet-windowed) when the body fails authentication', async () => {
    const res = await POST(request(payment(), { authTag: 'ff'.repeat(16) }));
    expect(res.status).toBe(401);
    expect(settleBooking).not.toHaveBeenCalled();
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ source: 'hyperpay-webhook' }),
      expect.objectContaining({ fingerprint: 'hyperpay-webhook:decrypt' }),
    );
  });

  it('acknowledges non-payment notifications without settling', async () => {
    const res = await POST(request({ type: 'RISK', payload: {} }));
    expect(res.status).toBe(200);
    expect(settleBooking).not.toHaveBeenCalled();
  });

  it('settles a payment and sends the receipt after the ack', async () => {
    const res = await POST(request(payment()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'success' });
    expect(settleBooking).toHaveBeenCalledWith(REFERENCE);
    // Deferred, not awaited inline (GAPB-02).
    expect(sendBookingReceiptEmail).not.toHaveBeenCalled();
    expect(afterCalls).toHaveLength(1);
    await afterCalls[0]();
    expect(sendBookingReceiptEmail).toHaveBeenCalledWith(REFERENCE);
  });

  it('acknowledges a permanent anomaly so OPPWA stops retrying', async () => {
    settleOutcome = 'anomaly';
    const res = await POST(request(payment()));
    expect(res.status).toBe(200);
    expect(afterCalls).toHaveLength(0);
  });

  it('answers 500 for a transient settle error so OPPWA redelivers', async () => {
    settleOutcome = 'error';
    expect((await POST(request(payment()))).status).toBe(500);
  });

  it('names a successful capture on a superseded checkout to a human', async () => {
    currentCheckoutId = 'chk-newer';
    await POST(request(payment({ ndc: 'chk-old', id: 'pay-1', amount: '480.00' })));
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ capturedCheckoutId: 'chk-old', currentCheckoutId: 'chk-newer' }),
      expect.objectContaining({ fingerprint: `superseded-capture:${REFERENCE}:chk-old` }),
    );
  });

  it('stays quiet when the capture is on the current checkout', async () => {
    await POST(request(payment()));
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
