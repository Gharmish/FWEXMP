import 'server-only';

import { serverEnv, hasEmail } from '@/lib/env';
import { SUPPORT_EMAIL } from '@/lib/site';
import { reportError } from '@/lib/log';

/**
 * Transactional email via Resend's REST API (called with `fetch`, no SDK —
 * same lean pattern as the HyperPay client). Gated by `hasEmail()`: a no-op
 * that returns `{ ok: false }` when unconfigured, so booking flows work
 * unchanged until `RESEND_API_KEY` + `RESEND_FROM` arrive. Never throws — a
 * failed receipt must not break a confirmed booking; it's logged and
 * swallowed.
 */

export interface EmailAttachment {
  /** File name the recipient sees, e.g. `Gharmish-GH-QTW3J9.pdf`. */
  filename: string;
  /** Base64-encoded file content (Resend's `attachments[].content` shape). */
  content: string;
  /** MIME type, e.g. `application/pdf`. Resend infers from the name if omitted. */
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
  /** Optional file attachments (e.g. the invoice PDF). */
  attachments?: readonly EmailAttachment[];
  /**
   * Reply-To address. Defaults to the monitored support inbox — several
   * templates say "just reply to this email", and `RESEND_FROM` is a
   * sending subdomain, not an inbox, so replies must be routed here.
   */
  replyTo?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailResult {
  ok: boolean;
  /**
   * Resend email id when the send was accepted — stored on the delivery
   * ledger as `providerMessageId`, the key the Resend delivery webhook
   * (`app/api/webhooks/resend`) correlates status events back with.
   */
  id: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!hasEmail()) return { ok: false, id: null };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: serverEnv.RESEND_FROM,
        to: input.to,
        reply_to: input.replyTo ?? SUPPORT_EMAIL,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
      }),
      cache: 'no-store',
      // A hung Resend socket must not stall a booking response (sends are
      // awaited inline today); the abort lands in the catch below.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      reportError(new Error(`Resend send failed (HTTP ${res.status})`), {
        surface: 'email-send',
        detail: detail.slice(0, 300),
      });
      return { ok: false, id: null };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    reportError(error, { surface: 'email-send' });
    return { ok: false, id: null };
  }
}
