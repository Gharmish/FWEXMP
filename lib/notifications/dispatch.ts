import 'server-only';

import { randomUUID } from 'node:crypto';
import { hasEmail, hasWhatsApp } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { reportError } from '@/lib/log';
import {
  addSuppression,
  claimDelivery,
  isSuppressed,
  markDeliveryFailed,
  markDeliverySent,
} from './ledger';
import { sendWhatsAppTemplate, whatsappAddress, whatsappContentSid } from './whatsapp';
import type { DispatchInput } from './types';

export type { DispatchInput, NotificationRecipient, WhatsAppTemplateKey } from './types';
export { addSuppression };

/**
 * Notification dispatcher — the single doorway every outbound message
 * goes through. Callers build channel payloads (rendered email, WhatsApp
 * template variables) and the dispatcher owns the cross-cutting rules:
 *
 *  - **Channel gating** — email needs Resend config + an address;
 *    WhatsApp needs Twilio config + a phone + an approved Content SID
 *    for the template. Whatever qualifies goes out; a phone-only guest
 *    gets WhatsApp, an email-only guest gets email, both get both.
 *  - **Suppression** — a STOPped phone / unsubscribed address is never
 *    messaged; the refusal is ledgered as `suppressed`.
 *  - **Idempotency** — the ledger claim (unique on dedupeKey+channel)
 *    collapses double-fired flows to one send per channel.
 *  - **The ledger** — every attempt leaves a row, so sends stop being
 *    fire-and-forget invisible.
 *
 * Same posture as `sendEmail`: best-effort, never throws — a failed
 * notification must never break the flow that triggered it.
 */

/**
 * Is ANY outbound channel configured? Senders use this as their early
 * exit so flows stay silent no-ops until Resend and/or Twilio arrive.
 */
export function notificationsConfigured(): boolean {
  return hasEmail() || hasWhatsApp();
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  // A caller omitting dedupeKey wants every call delivered (e.g.
  // application decisions across resubmit cycles) — a random key keeps
  // the row ledgered without ever colliding.
  const dedupeKey = input.dedupeKey ?? `${input.type}:${randomUUID()}`;
  await Promise.all([
    dispatchEmail(input, dedupeKey).catch((error) =>
      reportError(error, { surface: 'notifications:dispatch-email', type: input.type }),
    ),
    dispatchWhatsApp(input, dedupeKey).catch((error) =>
      reportError(error, { surface: 'notifications:dispatch-whatsapp', type: input.type }),
    ),
  ]);
}

async function dispatchEmail(input: DispatchInput, dedupeKey: string): Promise<void> {
  const email = input.recipient.email;
  if (!input.email || !hasEmail() || !email) return;

  const base = {
    dedupeKey,
    channel: 'email' as const,
    type: input.type,
    recipientType: input.recipient.kind,
    recipient: email.toLowerCase(),
    bookingId: input.bookingId,
    locale: input.recipient.locale,
  };

  if (await isSuppressed('email', email, { marketing: input.marketing })) {
    await claimDelivery({ ...base, suppressed: true });
    return;
  }

  const claim = await claimDelivery(base);
  if (!claim.claimed) return;

  const result = await sendEmail({
    to: email,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
    attachments: input.email.attachments,
  });
  if (result.ok) await markDeliverySent(claim.id, result.id);
  else await markDeliveryFailed(claim.id, 'resend rejected or unreachable');
}

async function dispatchWhatsApp(input: DispatchInput, dedupeKey: string): Promise<void> {
  if (!input.whatsapp || !hasWhatsApp()) return;
  const to = whatsappAddress(input.recipient.phone);
  if (!to) return;
  const contentSid =
    whatsappContentSid(input.whatsapp.template, input.recipient.locale) ??
    (input.whatsapp.fallbackTemplate
      ? whatsappContentSid(input.whatsapp.fallbackTemplate, input.recipient.locale)
      : null);

  const phone = to.replace('whatsapp:', '');
  const base = {
    dedupeKey,
    channel: 'whatsapp' as const,
    type: input.type,
    recipientType: input.recipient.kind,
    recipient: phone,
    bookingId: input.bookingId,
    locale: input.recipient.locale,
  };

  if (await isSuppressed('whatsapp', phone, { marketing: input.marketing })) {
    await claimDelivery({ ...base, suppressed: true });
    return;
  }

  const claim = await claimDelivery(base);
  if (!claim.claimed) return;

  // Template not approved (or not mapped) yet. Ledgered as `failed` —
  // not silently skipped — so a phone-only guest missing a message is
  // visible in the ops query, and the retry sweep re-drives the send
  // once the Content SID lands in the env map.
  if (!contentSid) {
    await markDeliveryFailed(claim.id, 'no approved content SID for template/locale');
    return;
  }

  // WhatsApp rejects a template rendered with a blank variable (an
  // opaque Twilio 400); fail the row with a diagnosable reason instead.
  const blank = Object.entries(input.whatsapp.variables).find(([, v]) => !v.trim());
  if (blank) {
    await markDeliveryFailed(claim.id, `blank template variable {{${blank[0]}}}`);
    return;
  }

  const result = await sendWhatsAppTemplate({
    to,
    contentSid,
    variables: input.whatsapp.variables,
  });
  if (result.ok) await markDeliverySent(claim.id, result.sid || null);
  else await markDeliveryFailed(claim.id, result.error);
}
