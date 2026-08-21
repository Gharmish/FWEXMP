import 'server-only';

import { serverEnv } from '@/lib/env';
import { SITE_URL } from '@/lib/site';
import { reportError } from '@/lib/log';
import type { Locale } from '@/lib/i18n';
import type { WhatsAppTemplateKey } from './types';

/**
 * Twilio WhatsApp adapter — Content-template sends via Twilio's REST API
 * (called with `fetch`, no SDK — same lean pattern as HyperPay/Resend).
 * Only ever called by the dispatcher after `hasWhatsApp()` and a
 * content-SID lookup both pass; never throws — failures return a result
 * the dispatcher ledgers as `failed`.
 *
 * Business messages outside Meta's 24h customer-service window MUST use
 * a pre-approved Content template — that's every lifecycle message we
 * send (crons and events fire at arbitrary times). Free-form `Body`
 * sends exist ONLY for replies inside an open window
 * ({@link sendWhatsAppText}); callers are responsible for the window
 * check (lib/conversations enforces it against `lastInboundAt`).
 */

/** Parsed `TWILIO_WHATSAPP_CONTENT_SIDS` env JSON, memoized per process. */
let contentSids: Record<string, string> | null | undefined;

function contentSidMap(): Record<string, string> | null {
  if (contentSids !== undefined) return contentSids;
  const raw = serverEnv.TWILIO_WHATSAPP_CONTENT_SIDS;
  if (!raw) {
    contentSids = null;
    return contentSids;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    contentSids =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : null;
  } catch (error) {
    reportError(error, { surface: 'whatsapp:content-sids-parse' });
    contentSids = null;
  }
  return contentSids;
}

/**
 * Approved Content SID for a template+locale, or null when the template
 * isn't live yet (the dispatcher then skips the WhatsApp channel).
 * Looks up `<template>.<locale>` first, then a locale-less `<template>`
 * key for templates that are approved in one shared form.
 */
export function whatsappContentSid(template: WhatsAppTemplateKey, locale: Locale): string | null {
  const map = contentSidMap();
  if (!map) return null;
  return map[`${template}.${locale}`] ?? map[template] ?? null;
}

/**
 * Normalize a stored phone into Twilio's `whatsapp:+E164` address, or
 * null when it isn't a dialable number (mirrors lib/whatsapp.ts's
 * deep-link validation).
 */
export function whatsappAddress(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `whatsapp:+${digits}`;
}

export type WhatsAppSendResult = { ok: true; sid: string } | { ok: false; error: string };

/**
 * Send one Content-template message. `to` is a `whatsapp:+E164` address
 * from {@link whatsappAddress}. Status callbacks (sent → delivered →
 * read / failed) are pointed at /api/webhooks/twilio, which upgrades
 * the ledger row by Message SID.
 */
export async function sendWhatsAppTemplate(input: {
  to: string;
  contentSid: string;
  variables: Record<string, string>;
}): Promise<WhatsAppSendResult> {
  return postMessage(input.to, {
    ContentSid: input.contentSid,
    ContentVariables: JSON.stringify(input.variables),
  });
}

/**
 * Send one free-form text message. Meta only accepts these inside the
 * 24h customer-service window opened by the recipient's last inbound
 * message — outside it Twilio returns 63016 and the send fails. Used by
 * the support line (acknowledgements, human/agent replies); never by
 * lifecycle notifications. Bodies are capped at WhatsApp's 4096 chars.
 */
export async function sendWhatsAppText(input: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  return postMessage(input.to, { Body: input.body.slice(0, 4096) });
}

async function postMessage(
  to: string,
  fields: Record<string, string>,
): Promise<WhatsAppSendResult> {
  const sid = serverEnv.TWILIO_ACCOUNT_SID;
  const from = serverEnv.TWILIO_WHATSAPP_FROM;
  const body = new URLSearchParams({
    To: to,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    ...fields,
    StatusCallback: `${SITE_URL}/api/webhooks/twilio`,
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${serverEnv.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        cache: 'no-store',
        // A hung Twilio socket must not stall a booking response — same
        // posture as the Resend client.
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      reportError(new Error(`Twilio send failed (HTTP ${res.status})`), {
        surface: 'whatsapp-send',
        detail: detail.slice(0, 300),
      });
      return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }

    const payload = (await res.json()) as { sid?: string };
    return { ok: true, sid: payload.sid ?? '' };
  } catch (error) {
    reportError(error, { surface: 'whatsapp-send' });
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' };
  }
}
