import 'server-only';

import { and, count, eq, gte } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { authThrottleEvents } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Server-side OTP throttle (2026-07 audit M2). The 30s cooldown cookie
 * stops double-clicks but is trivially discarded by a scripted caller,
 * which left Supabase's project rate limits as the ONLY ceiling on SMS
 * cost and code brute-force. This counts abuse events in the DB — the
 * same pattern as the booking-creation throttle — per identifier and
 * per IP.
 *
 * Failure posture: every check degrades OPEN with a Sentry report. A DB
 * blip must not lock every user out of sign-in, and Supabase's own
 * limits remain the backstop behind this layer. No DB configured
 * (stub-auth dev) → no throttling.
 *
 * Limits are deliberately generous for humans and hostile to scripts:
 *   - sends: 5 per identifier / 15 min, 15 per IP / hour
 *   - failed verifies: 10 per identifier / 15 min (a 6-digit code space
 *     needs ~500k guesses — 10 per window makes that centuries)
 */
const SEND_PER_IDENTIFIER = { max: 5, windowMs: 15 * 60_000 };
const SEND_PER_IP = { max: 15, windowMs: 60 * 60_000 };
const VERIFY_FAILS_PER_IDENTIFIER = { max: 10, windowMs: 15 * 60_000 };

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

/** First hop of x-forwarded-for — the client IP on Vercel. Null locally. */
export async function authClientIp(): Promise<string | null> {
  const h = await headers();
  const first = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

async function countSince(
  where: ReturnType<typeof and>,
  since: Date,
  kind: 'send' | 'verify_failed',
): Promise<number> {
  const [{ n }] = await db
    .select({ n: count(authThrottleEvents.id) })
    .from(authThrottleEvents)
    .where(and(where, eq(authThrottleEvents.kind, kind), gte(authThrottleEvents.createdAt, since)));
  return Number(n);
}

/** May another OTP be sent to this identifier from this IP right now? */
export async function otpSendAllowed(identifier: string, ip: string | null): Promise<boolean> {
  if (!hasDb()) return true;
  try {
    const byIdentifier = await countSince(
      and(eq(authThrottleEvents.identifier, identifier)),
      new Date(Date.now() - SEND_PER_IDENTIFIER.windowMs),
      'send',
    );
    if (byIdentifier >= SEND_PER_IDENTIFIER.max) return false;
    if (ip) {
      const byIp = await countSince(
        and(eq(authThrottleEvents.ip, ip)),
        new Date(Date.now() - SEND_PER_IP.windowMs),
        'send',
      );
      if (byIp >= SEND_PER_IP.max) return false;
    }
    return true;
  } catch (error) {
    reportError(error, { surface: 'auth-throttle:sendAllowed' });
    return true;
  }
}

/** Record an OTP send attempt (called BEFORE the provider — attempts count, not successes). */
export async function recordOtpSend(identifier: string, ip: string | null): Promise<void> {
  if (!hasDb()) return;
  try {
    await db.insert(authThrottleEvents).values({ identifier, ip, kind: 'send' });
  } catch (error) {
    reportError(error, { surface: 'auth-throttle:recordSend' });
  }
}

/** May this identifier attempt another code verification right now? */
export async function otpVerifyAllowed(identifier: string): Promise<boolean> {
  if (!hasDb()) return true;
  try {
    const fails = await countSince(
      and(eq(authThrottleEvents.identifier, identifier)),
      new Date(Date.now() - VERIFY_FAILS_PER_IDENTIFIER.windowMs),
      'verify_failed',
    );
    return fails < VERIFY_FAILS_PER_IDENTIFIER.max;
  } catch (error) {
    reportError(error, { surface: 'auth-throttle:verifyAllowed' });
    return true;
  }
}

/** Record a failed code verification. Successful verifies are not recorded. */
export async function recordOtpVerifyFailure(identifier: string, ip: string | null): Promise<void> {
  if (!hasDb()) return;
  try {
    await db.insert(authThrottleEvents).values({ identifier, ip, kind: 'verify_failed' });
  } catch (error) {
    reportError(error, { surface: 'auth-throttle:recordVerifyFailure' });
  }
}
