import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { adminTotpFactors } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Admin second factor (2026-08-02 security audit).
 *
 * Sign-in is a WhatsApp OTP, so "something you have" is the SIM — a
 * SIM-swap or hijacked WhatsApp session is a complete admin takeover:
 * all guest PII, decrypted national IDs and IBANs, refunds, payouts,
 * wallet issuance. TOTP adds a factor bound to the admin's device.
 *
 * Supabase's built-in MFA cannot be used: GoTrue builds the TOTP
 * account name from `user.GetEmail()` and fails enrolment for
 * phone-only accounts, which is every admin here. So the factor lives
 * in `admin_totp_factors` (secret encrypted at rest) and the
 * "this session passed the second factor" marker is a signed,
 * short-lived cookie — the equivalent of Supabase's aal2, under our
 * control.
 */

export const ADMIN_MFA_COOKIE = 'gharmish_admin_mfa';

/** How long one verification lasts before the code is asked for again. */
export const ADMIN_MFA_TTL_SECONDS = 12 * 60 * 60;

const KEY_LABEL = 'gharmish:admin-mfa-session:v1';
const TAG_LENGTH = 27;

export interface AdminMfaState {
  /** A confirmed TOTP factor exists for this admin. */
  enrolled: boolean;
  /** THIS session completed the second factor and hasn't expired. */
  verified: boolean;
}

export const NO_MFA: AdminMfaState = { enrolled: false, verified: false };

/**
 * HMAC key for the session marker. Same derivation posture as the
 * last-booking cookie: an explicit secret if configured, otherwise
 * derived from the service-role key (always present in production).
 *
 * FAIL CLOSED in production — no secret means no valid marker, so
 * admins are asked for a code every request rather than being waved
 * through on an unverifiable cookie.
 */
function signingKey(): Buffer | null {
  const base = serverEnv.COOKIE_SIGNING_SECRET || serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (base) return createHmac('sha256', base).update(KEY_LABEL).digest();
  if (serverEnv.NODE_ENV !== 'production') {
    return createHmac('sha256', 'gharmish-dev-only-cookie-key').update(KEY_LABEL).digest();
  }
  return null;
}

function tagFor(payload: string, key: Buffer): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, TAG_LENGTH);
}

/**
 * Marker value: `<userId>:<expiryUnixSeconds>.<tag>`.
 *
 * The user id is inside the signed payload, so a marker minted for one
 * admin cannot be replayed by another session, and the expiry is signed
 * too so it can't be extended by editing the cookie.
 */
export function serializeAdminMfaCookie(userId: string, expiresAtSeconds: number): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload = `${userId}:${expiresAtSeconds}`;
  return `${payload}.${tagFor(payload, key)}`;
}

/**
 * Verify a marker against the user it must belong to. Exported for
 * tests — this is the check that stands between an aal1 session and the
 * back office, so its edge cases (wrong user, expired, tampered tag,
 * unsigned) are worth pinning down explicitly.
 */
export function verifyAdminMfaMarker(
  value: string | undefined,
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  return markerIsValidFor(value, userId, nowSeconds);
}

function markerIsValidFor(value: string | undefined, userId: string, nowSeconds: number): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;

  const payload = value.slice(0, dot);
  const provided = Buffer.from(value.slice(dot + 1));
  const key = signingKey();
  if (!key) return false;

  const expected = Buffer.from(tagFor(payload, key));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

  const separator = payload.lastIndexOf(':');
  if (separator <= 0) return false;
  if (payload.slice(0, separator) !== userId) return false;

  const expiry = Number(payload.slice(separator + 1));
  return Number.isFinite(expiry) && expiry > nowSeconds;
}

/**
 * Read this admin's factor + verification state.
 *
 * Fails CLOSED on a database error (`enrolled: true, verified: false`):
 * if we cannot tell, ask for a code rather than wave the session
 * through. The alternative silently disables the second factor exactly
 * when the database is misbehaving.
 */
export async function readAdminMfaState(userId: string): Promise<AdminMfaState> {
  if (!serverEnv.DATABASE_URL) return NO_MFA;
  try {
    const factor = await db.query.adminTotpFactors.findFirst({
      where: eq(adminTotpFactors.userId, userId),
      columns: { confirmedAt: true },
    });
    const enrolled = Boolean(factor?.confirmedAt);
    if (!enrolled) return { enrolled: false, verified: false };

    const store = await cookies();
    const verified = markerIsValidFor(
      store.get(ADMIN_MFA_COOKIE)?.value,
      userId,
      Math.floor(Date.now() / 1000),
    );
    return { enrolled: true, verified };
  } catch (error) {
    reportError(error, { surface: 'admin-mfa:readState' });
    return { enrolled: true, verified: false };
  }
}

/** What the admin surface should do about this state. */
export type AdminMfaRequirement = 'ok' | 'enroll' | 'verify';

export function mfaRequirement(state: AdminMfaState): AdminMfaRequirement {
  if (state.verified) return 'ok';
  return state.enrolled ? 'verify' : 'enroll';
}
