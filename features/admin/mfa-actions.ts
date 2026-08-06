'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { adminTotpFactors } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { reportError } from '@/lib/log';
import { decryptPii, encryptPii } from '@/lib/pii-crypto';
import { generateTotpSecret, totpUri, verifyTotp } from '@/lib/totp';
import {
  ADMIN_MFA_COOKIE,
  ADMIN_MFA_TTL_SECONDS,
  serializeAdminMfaCookie,
} from '@/features/admin/mfa';
import {
  authClientIp,
  otpVerifyAllowed,
  recordOtpVerifyFailure,
} from '@/features/auth/lib/throttle';

/**
 * Admin TOTP enrolment + verification (2026-08-02 security audit).
 *
 * These actions deliberately do NOT go through `adminGuard()`: that gate
 * requires a completed second factor, and requiring the second factor in
 * order to set up the second factor is a deadlock. They gate on
 * `isAdminUser` alone — exactly the privilege needed to manage your own
 * factor. Every call acts on the CALLER's own row; nothing identifying a
 * factor is ever taken from the form.
 */

const ISSUER = 'Gharmish';

export interface MfaEnrollState {
  status: 'idle' | 'ready' | 'error';
  /** QR image as a data URI, rendered from our own otpauth:// URI. */
  qrCode?: string;
  /** The same secret in text form, for manual entry. */
  secret?: string;
  error?: 'forbidden' | 'unavailable' | 'server';
}

export interface MfaVerifyState {
  status: 'idle' | 'ok' | 'error';
  error?: 'forbidden' | 'unavailable' | 'invalid_code' | 'throttled' | 'no_factor' | 'server';
}

async function mfaCaller() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) return { error: 'forbidden' as const };
  // Stub-mode dev has no real auth user to bind a factor to; the admin
  // surface skips the factor there (never production — `stubAuthAllowed`).
  if (user.isStub || !serverEnv.DATABASE_URL) return { error: 'unavailable' as const };
  return { user };
}

/**
 * Begin (or restart) enrolment: mint a secret and store it UNCONFIRMED.
 *
 * A confirmed factor is never overwritten — that would let anyone with a
 * live admin session silently swap the second factor for their own,
 * which is precisely the takeover this feature exists to stop. Resetting
 * a lost device is an owner-assisted row deletion.
 */
export async function startAdminMfaEnrollment(): Promise<MfaEnrollState> {
  const caller = await mfaCaller();
  if ('error' in caller) return { status: 'error', error: caller.error };

  try {
    const existing = await db.query.adminTotpFactors.findFirst({
      where: eq(adminTotpFactors.userId, caller.user.id),
      columns: { confirmedAt: true },
    });
    if (existing?.confirmedAt) return { status: 'error', error: 'forbidden' };

    const secret = generateTotpSecret();
    await db
      .insert(adminTotpFactors)
      .values({ userId: caller.user.id, secret: encryptPii(secret) })
      .onConflictDoUpdate({
        target: adminTotpFactors.userId,
        set: { secret: encryptPii(secret), lastUsedStep: null, updatedAt: new Date() },
        // Belt for the read above: never clobber a CONFIRMED factor, even
        // if two enrolment attempts race.
        setWhere: isNull(adminTotpFactors.confirmedAt),
      });

    const account = caller.user.phone || caller.user.email || 'admin';
    const uri = totpUri({ secret, account, issuer: ISSUER });
    const qrCode = await QRCode.toDataURL(uri, { margin: 1, width: 480 });

    return { status: 'ready', qrCode, secret };
  } catch (error) {
    reportError(error, { surface: 'admin-mfa:enroll' });
    return { status: 'error', error: 'server' };
  }
}

function codeFrom(formData: FormData): string {
  const raw = formData.get('code');
  return typeof raw === 'string' ? raw.replace(/\D/g, '').slice(0, 6) : '';
}

/**
 * Verify a code — confirms a fresh enrolment and, either way, marks this
 * session as having passed the second factor.
 *
 * Three defences beyond the code itself: a per-admin throttle on the
 * shared auth-throttle table, a replay guard (`last_used_step`) so the
 * same six digits can't be reused inside their validity window, and a
 * signed, expiring session marker rather than a boolean cookie.
 */
export async function verifyAdminMfa(
  _previous: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const caller = await mfaCaller();
  if ('error' in caller) return { status: 'error', error: caller.error };

  const code = codeFrom(formData);
  if (code.length !== 6) return { status: 'error', error: 'invalid_code' };

  const identifier = `mfa:${caller.user.id}`;
  if (!(await otpVerifyAllowed(identifier))) return { status: 'error', error: 'throttled' };

  try {
    const factor = await db.query.adminTotpFactors.findFirst({
      where: eq(adminTotpFactors.userId, caller.user.id),
      columns: { secret: true, lastUsedStep: true, confirmedAt: true },
    });
    if (!factor) return { status: 'error', error: 'no_factor' };

    const result = verifyTotp(decryptPii(factor.secret), code);
    if (!result.valid || result.step === undefined) {
      await recordOtpVerifyFailure(identifier, await authClientIp());
      return { status: 'error', error: 'invalid_code' };
    }

    // Replay guard. The conditional UPDATE is the authority (not the
    // read above), so two concurrent submissions of the same code can't
    // both win: the loser matches zero rows.
    const claimed = await db
      .update(adminTotpFactors)
      .set({
        lastUsedStep: result.step,
        confirmedAt: factor.confirmedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adminTotpFactors.userId, caller.user.id),
          or(
            isNull(adminTotpFactors.lastUsedStep),
            sql`${adminTotpFactors.lastUsedStep} < ${result.step}`,
          ),
        ),
      )
      .returning({ userId: adminTotpFactors.userId });
    if (claimed.length === 0) {
      await recordOtpVerifyFailure(identifier, await authClientIp());
      return { status: 'error', error: 'invalid_code' };
    }

    const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_MFA_TTL_SECONDS;
    const marker = serializeAdminMfaCookie(caller.user.id, expiresAt);
    if (!marker) return { status: 'error', error: 'server' };

    const store = await cookies();
    store.set(ADMIN_MFA_COOKIE, marker, {
      httpOnly: true,
      // Strict, not lax: this marker is the second factor, and nothing
      // should carry it into a cross-site navigation.
      sameSite: 'strict',
      secure: serverEnv.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_MFA_TTL_SECONDS,
    });

    revalidatePath('/[locale]/admin', 'layout');
    return { status: 'ok' };
  } catch (error) {
    reportError(error, { surface: 'admin-mfa:verify' });
    return { status: 'error', error: 'server' };
  }
}
