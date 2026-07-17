import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

/**
 * Twilio webhook tests. The signature check is the route's ONLY
 * authenticity gate — a forged STOP could silence a guest's booking
 * receipts — so these pin both directions: a request signed with the
 * auth token over the exact URL + sorted params is accepted, and a
 * missing/wrong signature is 401. On top of that: status callbacks
 * upgrade the ledger by Message SID, inbound STOP/START keywords (in
 * both languages) drive the suppression list, anything else is
 * acknowledged with empty TwiML, and internal failures answer 204 so
 * Twilio doesn't retry-hammer an issue we already logged.
 */

const env = vi.hoisted(() => ({
  configured: true,
  serverEnv: { TWILIO_AUTH_TOKEN: 'token-test' },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: env.serverEnv,
  hasWhatsApp: () => env.configured,
}));

vi.mock('@/lib/site', () => ({ SITE_URL: 'https://gharmish.com' }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const applyProviderStatus = vi.fn(async () => undefined);
const addSuppression = vi.fn(async () => undefined);
const removeSuppression = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/ledger', () => ({
  applyProviderStatus: (...args: unknown[]) => applyProviderStatus(...(args as [])),
  addSuppression: (...args: unknown[]) => addSuppression(...(args as [])),
  removeSuppression: (...args: unknown[]) => removeSuppression(...(args as [])),
}));

import { POST } from './route';

const WEBHOOK_URL = 'https://gharmish.com/api/webhooks/twilio';

/** Twilio's scheme: HMAC-SHA1(auth token) over URL + sorted key+value pairs. */
function sign(params: Record<string, string>, token = 'token-test'): string {
  const data =
    WEBHOOK_URL +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  return createHmac('sha1', token).update(data).digest('base64');
}

function request(params: Record<string, string>, signature?: string): NextRequest {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature !== undefined ? { 'x-twilio-signature': signature } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  env.configured = true;
});

describe('POST /api/webhooks/twilio — gate', () => {
  it('answers 503 while Twilio is unconfigured (inert until go-live)', async () => {
    env.configured = false;

    const res = await POST(request({ MessageStatus: 'delivered', MessageSid: 'SM-1' }));

    expect(res.status).toBe(503);
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('rejects a request with no signature', async () => {
    const res = await POST(request({ MessageStatus: 'delivered', MessageSid: 'SM-1' }));

    expect(res.status).toBe(401);
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('rejects a signature made with the wrong token', async () => {
    const params = { MessageStatus: 'delivered', MessageSid: 'SM-1' };

    const res = await POST(request(params, sign(params, 'attacker-token')));

    expect(res.status).toBe(401);
  });

  it('rejects a valid signature over tampered params', async () => {
    const signature = sign({ Body: 'hello', From: 'whatsapp:+966541104000' });

    const res = await POST(request({ Body: 'stop', From: 'whatsapp:+966541104000' }, signature));

    expect(res.status).toBe(401);
    expect(addSuppression).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/twilio — status callbacks', () => {
  it('mirrors a delivery status onto the ledger row by Message SID', async () => {
    const params = { MessageStatus: 'delivered', MessageSid: 'SM-1' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(204);
    expect(applyProviderStatus).toHaveBeenCalledWith('SM-1', 'delivered', undefined);
  });

  it('maps undelivered to failed and carries the Twilio error code', async () => {
    const params = { MessageStatus: 'undelivered', MessageSid: 'SM-1', ErrorCode: '63016' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(204);
    expect(applyProviderStatus).toHaveBeenCalledWith(
      'SM-1',
      'failed',
      'Twilio undelivered (63016)',
    );
  });

  it('acknowledges but ignores statuses outside the map (e.g. queued)', async () => {
    const params = { MessageStatus: 'queued', MessageSid: 'SM-1' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(204);
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('answers 204 even when the ledger update blows up (no retry hammering)', async () => {
    applyProviderStatus.mockRejectedValueOnce(new Error('db down'));
    const params = { MessageStatus: 'read', MessageSid: 'SM-1' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(204);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/webhooks/twilio — inbound keywords', () => {
  it('suppresses the sender on STOP (case-insensitive, whatsapp: prefix stripped)', async () => {
    const params = { From: 'whatsapp:+966541104000', Body: ' STOP ' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/xml');
    expect(await res.text()).toContain('<Response/>');
    expect(addSuppression).toHaveBeenCalledWith('whatsapp', '+966541104000', 'stop');
  });

  it('honors the Arabic opt-out keyword', async () => {
    const params = { From: 'whatsapp:+966541104000', Body: 'إيقاف' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(200);
    expect(addSuppression).toHaveBeenCalledWith('whatsapp', '+966541104000', 'stop');
  });

  it('lifts the suppression on START', async () => {
    const params = { From: 'whatsapp:+966541104000', Body: 'start' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(200);
    expect(removeSuppression).toHaveBeenCalledWith('whatsapp', '+966541104000');
    expect(addSuppression).not.toHaveBeenCalled();
  });

  it('acknowledges an ordinary reply without touching the suppression list', async () => {
    const params = { From: 'whatsapp:+966541104000', Body: 'What time do we meet?' };

    const res = await POST(request(params, sign(params)));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Response/>');
    expect(addSuppression).not.toHaveBeenCalled();
    expect(removeSuppression).not.toHaveBeenCalled();
  });
});
