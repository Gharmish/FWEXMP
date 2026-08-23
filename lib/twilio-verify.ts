import 'server-only';

import { hasTwilioVerify, serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';

/**
 * Twilio Verify (v2) over WhatsApp — a one-time code to an arbitrary
 * phone, checked server-side. Used to prove a host's NEW contact phone
 * before notifications move to it (2026-08-22). The Verify service is
 * the same "Gharmish" service Supabase phone sign-in uses (see
 * docs/auth-phone/twilio-otp-setup.md), so codes arrive as the branded
 * Copy-Code WhatsApp message hosts already know from signing in.
 *
 * Both calls are best-effort on the transport: a Twilio outage reads as
 * `{ ok: false, reason: 'provider' }`, never a throw. Rate limiting is
 * the CALLER's job (features/auth/lib/throttle) — this module only
 * talks to Twilio.
 */

const VERIFY_BASE = 'https://verify.twilio.com/v2/Services';

export type VerifyStartResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'invalid_phone' | 'rate_limited' | 'provider' };

export type VerifyCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'unconfigured' | 'invalid_code' | 'expired' | 'rate_limited' | 'provider';
    };

function authHeader(): string {
  const creds = `${serverEnv.TWILIO_ACCOUNT_SID}:${serverEnv.TWILIO_AUTH_TOKEN}`;
  return `Basic ${Buffer.from(creds).toString('base64')}`;
}

async function post(
  path: string,
  body: Record<string, string>,
): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const response = await fetch(`${VERIFY_BASE}/${serverEnv.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    // Twilio always answers JSON; an empty/invalid body is a transport fault.
  }
  return { status: response.status, json };
}

/** Send a code to `phoneE164` over WhatsApp. */
export async function startPhoneVerification(
  phoneE164: string,
  locale: 'en' | 'ar',
): Promise<VerifyStartResult> {
  if (!hasTwilioVerify()) return { ok: false, reason: 'unconfigured' };
  try {
    const { status, json } = await post('Verifications', {
      To: phoneE164,
      Channel: 'whatsapp',
      Locale: locale,
    });
    if (status === 201 || json.status === 'pending') return { ok: true };
    const code = Number(json.code);
    // 60200 invalid parameter (bad number), 60203 max send attempts, 429 throttled.
    if (code === 60200 || code === 21211) return { ok: false, reason: 'invalid_phone' };
    if (code === 60203 || status === 429) return { ok: false, reason: 'rate_limited' };
    reportError(new Error(`twilio verify start failed: ${status} ${String(json.message ?? '')}`), {
      surface: 'twilio-verify:start',
      code: String(code),
    });
    return { ok: false, reason: 'provider' };
  } catch (error) {
    reportError(error, { surface: 'twilio-verify:start' });
    return { ok: false, reason: 'provider' };
  }
}

/** Check a code the person typed against the pending verification for `phoneE164`. */
export async function checkPhoneVerification(
  phoneE164: string,
  code: string,
): Promise<VerifyCheckResult> {
  if (!hasTwilioVerify()) return { ok: false, reason: 'unconfigured' };
  try {
    const { status, json } = await post('VerificationCheck', { To: phoneE164, Code: code });
    if (status === 200 && json.status === 'approved') return { ok: true };
    if (status === 200) return { ok: false, reason: 'invalid_code' };
    const twilioCode = Number(json.code);
    // 20404: no pending verification (expired or already used).
    if (status === 404 || twilioCode === 20404) return { ok: false, reason: 'expired' };
    // 60202: max check attempts reached.
    if (twilioCode === 60202 || status === 429) return { ok: false, reason: 'rate_limited' };
    reportError(new Error(`twilio verify check failed: ${status} ${String(json.message ?? '')}`), {
      surface: 'twilio-verify:check',
      code: String(twilioCode),
    });
    return { ok: false, reason: 'provider' };
  } catch (error) {
    reportError(error, { surface: 'twilio-verify:check' });
    return { ok: false, reason: 'provider' };
  }
}
