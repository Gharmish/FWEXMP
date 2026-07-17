import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv, hasWhatsApp } from '@/lib/env';
import { SITE_URL } from '@/lib/site';
import { reportError } from '@/lib/log';
import {
  addSuppression,
  applyProviderStatus,
  removeSuppression,
  type WebhookStatus,
} from '@/lib/notifications/ledger';

/**
 * Twilio webhook — two kinds of POSTs land here:
 *
 *  1. **Status callbacks** for outbound WhatsApp messages (we pass this
 *     URL as `StatusCallback` on every send): `sent` → `delivered` →
 *     `read`, or `failed`/`undelivered`. They upgrade the matching
 *     delivery-ledger row by Message SID.
 *  2. **Inbound messages** (configure this URL as the WhatsApp sender's
 *     incoming-message webhook): only opt-out/opt-in keywords are acted
 *     on — STOP suppresses the phone across all WhatsApp sends, START
 *     lifts it. Anything else is acknowledged and ignored (replies go
 *     to the humans via the Twilio console / future inbox).
 *
 * Auth: Twilio signs every request with `X-Twilio-Signature` =
 * HMAC-SHA1(auth token) over the exact webhook URL + the alphabetically
 * sorted POST params. The URL Twilio must be configured with is exactly
 * `${SITE_URL}/api/webhooks/twilio` — any variation (trailing slash,
 * query string, http) breaks validation. With Twilio unconfigured the
 * route answers 503, so it's inert until go-live.
 */

/** The exact URL Twilio signs — must match the Twilio-side configuration. */
const WEBHOOK_URL = `${SITE_URL}/api/webhooks/twilio`;

function validSignature(params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const data =
    WEBHOOK_URL +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  const expected = createHmac('sha1', serverEnv.TWILIO_AUTH_TOKEN).update(data).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Twilio message statuses we mirror into the ledger; the rest are noise. */
const STATUS_MAP: Record<string, WebhookStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  undelivered: 'failed',
};

/**
 * Opt-out / opt-in keywords, matched on the trimmed whole message
 * (case-insensitive). English set mirrors Twilio's standard opt-out
 * keywords; Arabic covers the forms a Saudi guest would actually type.
 */
const STOP_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'end',
  'quit',
  'إيقاف',
  'ايقاف',
  'توقف',
  'الغاء',
  'إلغاء',
]);
const START_KEYWORDS = new Set(['start', 'unstop', 'ابدأ', 'ابدا']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasWhatsApp()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  let params: Record<string, string>;
  try {
    const form = await request.formData();
    params = Object.fromEntries(
      [...form.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch (error) {
    reportError(error, { surface: 'webhook-twilio:parse' });
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  if (!validSignature(params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    // Status callback for an outbound message.
    const messageStatus = params.MessageStatus?.toLowerCase();
    if (messageStatus) {
      const mapped = STATUS_MAP[messageStatus];
      if (mapped && params.MessageSid) {
        await applyProviderStatus(
          params.MessageSid,
          mapped,
          mapped === 'failed'
            ? `Twilio ${messageStatus} (${params.ErrorCode ?? 'no code'})`
            : undefined,
        );
      }
      return new NextResponse(null, { status: 204 });
    }

    // Inbound message — opt-out/opt-in keywords only.
    const from = params.From?.replace(/^whatsapp:/, '');
    const body = params.Body?.trim().toLowerCase() ?? '';
    if (from) {
      if (STOP_KEYWORDS.has(body)) await addSuppression('whatsapp', from, 'stop');
      else if (START_KEYWORDS.has(body)) await removeSuppression('whatsapp', from);
    }
    // Empty TwiML: acknowledge without auto-replying.
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    reportError(error, { surface: 'webhook-twilio' });
    // 200 so Twilio doesn't hammer retries for an internal issue we've
    // already logged — status callbacks are best-effort observability.
    return new NextResponse(null, { status: 204 });
  }
}
