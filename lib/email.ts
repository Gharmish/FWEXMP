import 'server-only';

import { serverEnv, hasEmail } from '@/lib/env';
import { reportError } from '@/lib/log';

/**
 * Transactional email via Resend's REST API (called with `fetch`, no SDK —
 * same lean pattern as the HyperPay client). Gated by `hasEmail()`: a no-op
 * that returns `false` when unconfigured, so booking flows work unchanged
 * until `RESEND_API_KEY` + `RESEND_FROM` arrive. Never throws — a failed
 * receipt must not break a confirmed booking; it's logged and swallowed.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!hasEmail()) return false;

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
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      reportError(new Error(`Resend send failed (HTTP ${res.status})`), {
        surface: 'email-send',
        detail: detail.slice(0, 300),
      });
      return false;
    }
    return true;
  } catch (error) {
    reportError(error, { surface: 'email-send' });
    return false;
  }
}
