import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

/**
 * Resend webhook tests. The Svix signature is the route's only
 * authenticity gate — a forged bounce could suppress a live guest's
 * address and silence their receipts — so these pin both directions:
 * a correctly signed payload is accepted (including the multi-signature
 * header Svix sends during secret rotation), and missing/wrong/stale
 * signatures are 401. On top of that: delivered upgrades the ledger,
 * permanent bounces fail the row AND suppress, transient bounces fail
 * the row but do NOT suppress (the retry sweep re-drives them),
 * complaints suppress without touching the row, and internal failures
 * answer 200 so Svix doesn't retry-hammer an issue we already logged.
 */

const SIGNING_KEY = Buffer.from('resend-webhook-test-key');

const env = vi.hoisted(() => ({
  serverEnv: { RESEND_WEBHOOK_SECRET: '' as string },
}));
env.serverEnv.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('resend-webhook-test-key').toString('base64')}`;

vi.mock('@/lib/env', () => ({ serverEnv: env.serverEnv }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const applyProviderStatus = vi.fn(async () => undefined);
const addSuppression = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/ledger', () => ({
  applyProviderStatus: (...args: unknown[]) => applyProviderStatus(...(args as [])),
  addSuppression: (...args: unknown[]) => addSuppression(...(args as [])),
}));

import { POST } from './route';

const WEBHOOK_URL = 'https://gharmish.com/api/webhooks/resend';

/** Svix scheme: HMAC-SHA256(key) over `{id}.{timestamp}.{payload}`, base64. */
function sign(payload: string, id = 'msg_1', timestamp = `${Math.floor(Date.now() / 1000)}`) {
  const signature = createHmac('sha256', SIGNING_KEY)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return { id, timestamp, signature: `v1,${signature}` };
}

function request(
  payload: string,
  headers?: Partial<{ id: string; timestamp: string; signature: string }>,
): NextRequest {
  const signed = { ...sign(payload), ...headers };
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': signed.id,
      'svix-timestamp': signed.timestamp,
      'svix-signature': signed.signature,
    },
    body: payload,
  });
}

function event(type: string, data: Record<string, unknown>): string {
  return JSON.stringify({ type, created_at: '2026-07-17T09:00:00.000Z', data });
}

const DELIVERED = event('email.delivered', { email_id: 're-1', to: ['guest@example.com'] });

const secret = env.serverEnv.RESEND_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  env.serverEnv.RESEND_WEBHOOK_SECRET = secret;
});

describe('POST /api/webhooks/resend — gate', () => {
  it('answers 503 while the webhook secret is unconfigured (inert until set up)', async () => {
    env.serverEnv.RESEND_WEBHOOK_SECRET = '';

    const res = await POST(request(DELIVERED));

    expect(res.status).toBe(503);
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed payload', async () => {
    const res = await POST(request(DELIVERED));

    expect(res.status).toBe(200);
    expect(applyProviderStatus).toHaveBeenCalledWith('re-1', 'delivered');
  });

  it('accepts when any signature in a rotation list matches', async () => {
    const good = sign(DELIVERED);
    const res = await POST(
      request(DELIVERED, { signature: `v1,${'A'.repeat(43)}= ${good.signature}` }),
    );

    expect(res.status).toBe(200);
  });

  it('rejects a wrong signature with 401', async () => {
    const res = await POST(request(DELIVERED, { signature: `v1,${'A'.repeat(43)}=` }));

    expect(res.status).toBe(401);
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 401', async () => {
    const req = new NextRequest(WEBHOOK_URL, { method: 'POST', body: DELIVERED });

    expect((await POST(req)).status).toBe(401);
  });

  it('rejects a stale timestamp with 401 (replay window)', async () => {
    const stale = `${Math.floor(Date.now() / 1000) - 10 * 60}`;
    const res = await POST(request(DELIVERED, { ...sign(DELIVERED, 'msg_1', stale) }));

    expect(res.status).toBe(401);
  });

  it('rejects a tampered payload with 401', async () => {
    const signed = sign(DELIVERED);
    const tampered = event('email.delivered', { email_id: 're-EVIL', to: ['guest@example.com'] });
    const res = await POST(request(tampered, signed));

    expect(res.status).toBe(401);
  });

  it('answers 400 for a signed but unparseable body', async () => {
    const res = await POST(request('not json'));

    expect(res.status).toBe(400);
  });
});

describe('POST /api/webhooks/resend — events', () => {
  it('upgrades the ledger row on email.delivered', async () => {
    await POST(request(DELIVERED));

    expect(applyProviderStatus).toHaveBeenCalledWith('re-1', 'delivered');
    expect(addSuppression).not.toHaveBeenCalled();
  });

  it('fails the row AND suppresses the address on a permanent bounce', async () => {
    const payload = event('email.bounced', {
      email_id: 're-1',
      to: ['dead@example.com'],
      bounce: { type: 'Permanent', subType: 'General', message: 'no such user' },
    });

    await POST(request(payload));

    expect(applyProviderStatus).toHaveBeenCalledWith(
      're-1',
      'failed',
      'Resend bounce (Permanent/General)',
    );
    expect(addSuppression).toHaveBeenCalledWith('email', 'dead@example.com', 'bounce');
  });

  it('fails the row but does NOT suppress on a transient bounce (retry sweep re-drives it)', async () => {
    const payload = event('email.bounced', {
      email_id: 're-1',
      to: ['full@example.com'],
      bounce: { type: 'Transient', subType: 'MailboxFull', message: 'mailbox full' },
    });

    await POST(request(payload));

    expect(applyProviderStatus).toHaveBeenCalledWith(
      're-1',
      'failed',
      'Resend bounce (Transient/MailboxFull)',
    );
    expect(addSuppression).not.toHaveBeenCalled();
  });

  it('suppresses without touching the ledger row on a complaint', async () => {
    const payload = event('email.complained', { email_id: 're-1', to: ['angry@example.com'] });

    await POST(request(payload));

    expect(addSuppression).toHaveBeenCalledWith('email', 'angry@example.com', 'complaint');
    expect(applyProviderStatus).not.toHaveBeenCalled();
  });

  it('fails the row with the reason on email.failed', async () => {
    const payload = event('email.failed', {
      email_id: 're-1',
      to: ['guest@example.com'],
      failed: { reason: 'sending quota exceeded' },
    });

    await POST(request(payload));

    expect(applyProviderStatus).toHaveBeenCalledWith(
      're-1',
      'failed',
      'Resend failed (sending quota exceeded)',
    );
  });

  it('acknowledges and ignores event types it does not act on', async () => {
    await POST(request(event('email.opened', { email_id: 're-1' })));
    const res = await POST(request(event('email.delivery_delayed', { email_id: 're-1' })));

    expect(res.status).toBe(200);
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(addSuppression).not.toHaveBeenCalled();
  });

  it('answers 200 and reports when a handler blows up (no Svix retry-hammer)', async () => {
    applyProviderStatus.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(request(DELIVERED));

    expect(res.status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
