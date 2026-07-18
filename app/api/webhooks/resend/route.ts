import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { addSuppression, applyProviderStatus } from '@/lib/notifications/ledger';

/**
 * Resend delivery webhook — closes the email feedback loop the same way
 * the Twilio webhook does for WhatsApp. Resend POSTs one event per
 * lifecycle step of an email we sent; we mirror the ones that matter
 * into the delivery ledger by `email_id` (stored as
 * `providerMessageId` at send time) and feed the suppression list:
 *
 *  - `email.delivered`            → ledger `delivered`
 *  - `email.bounced`              → ledger `failed`; a permanent bounce
 *    also suppresses the address (dead mailbox — retrying only burns
 *    sender reputation). Transient bounces are NOT suppressed: the
 *    failed row stays retryable and the cron sweep re-drives it.
 *  - `email.complained`           → suppress (reason `complaint`). The
 *    ledger row is left as-is — the mail WAS delivered; the complaint
 *    is about the future, not this row.
 *  - `email.failed`               → ledger `failed`
 *  - everything else (`sent`, `opened`, `clicked`, `delivery_delayed`)
 *    is acknowledged and ignored.
 *
 * Auth: Resend signs via Svix — `svix-signature` carries HMAC-SHA256
 * (base64 secret after the `whsec_` prefix) over
 * `{svix-id}.{svix-timestamp}.{raw body}`, with a timestamp freshness
 * check against replays. With no `RESEND_WEBHOOK_SECRET` set the route
 * answers 503, so it's inert until the webhook is configured in the
 * Resend dashboard (endpoint: `${SITE_URL}/api/webhooks/resend`).
 */

/** Max clock skew accepted on `svix-timestamp` (replay window). */
const TIMESTAMP_TOLERANCE_S = 5 * 60;

function signingKey(): Buffer | null {
  const secret = serverEnv.RESEND_WEBHOOK_SECRET;
  if (!secret) return null;
  try {
    return Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  } catch {
    return null;
  }
}

function validSignature(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): boolean {
  const key = signingKey();
  if (!key || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TIMESTAMP_TOLERANCE_S) return false;

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest();
  // The header is space-separated `v1,<base64>` entries (Svix rotates
  // secrets by signing with several at once) — any match accepts.
  return headers.signature.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'base64');
    } catch {
      return false;
    }
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
  };
}

/** Every recipient address on the event, normalised to an array. */
function recipients(data: ResendEvent['data']): string[] {
  const to = data?.to;
  if (Array.isArray(to)) return to.filter((a): a is string => typeof a === 'string');
  return typeof to === 'string' ? [to] : [];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!serverEnv.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const payload = await request.text();
  const valid = validSignature(payload, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    const emailId = event.data?.email_id;
    switch (event.type) {
      case 'email.delivered':
        if (emailId) await applyProviderStatus(emailId, 'delivered');
        break;
      case 'email.bounced': {
        const bounce = event.data?.bounce;
        if (emailId) {
          await applyProviderStatus(
            emailId,
            'failed',
            `Resend bounce (${bounce?.type ?? 'unknown'}${bounce?.subType ? `/${bounce.subType}` : ''})`,
          );
        }
        // Suppress unless Resend explicitly says the bounce is
        // transient (mailbox full, greylisting) — those may succeed on
        // the cron retry; suppressing them would silence a live guest.
        if (bounce?.type?.toLowerCase() !== 'transient') {
          for (const address of recipients(event.data)) {
            await addSuppression('email', address, 'bounce');
          }
        }
        break;
      }
      case 'email.complained':
        for (const address of recipients(event.data)) {
          await addSuppression('email', address, 'complaint');
        }
        break;
      case 'email.failed':
        if (emailId) {
          await applyProviderStatus(
            emailId,
            'failed',
            `Resend failed (${event.data?.failed?.reason ?? 'no reason'})`,
          );
        }
        break;
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, { surface: 'webhook-resend', type: event.type });
    // 200 so Svix doesn't retry-hammer an internal issue we already
    // logged — delivery feedback is best-effort observability.
    return NextResponse.json({ ok: true });
  }
}
