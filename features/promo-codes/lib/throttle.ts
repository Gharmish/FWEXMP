import 'server-only';

import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { authThrottleEvents } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Promo-code attempt throttle (2026-07-28 audit). Redemption caps are
 * counted under the promo row's lock, but nothing limited ATTEMPTS — a
 * guest holding one live unpaid booking could enumerate short
 * human-memorable codes at will. Rides the same `auth_throttle_events`
 * table as the OTP throttle (kind `promo_attempt`, identifier = guest
 * id) and the same failure posture: every check degrades OPEN with a
 * Sentry report, because a DB blip must not break checkout.
 *
 * 10 attempts / 15 min is invisible to a human mistyping a code and
 * useless to an enumerator.
 */
const ATTEMPTS_PER_GUEST = { max: 10, windowMs: 15 * 60_000 };

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

/** May this guest attempt another promo code right now? */
export async function promoAttemptAllowed(guestId: string): Promise<boolean> {
  if (!hasDb()) return true;
  try {
    const [{ n }] = await db
      .select({ n: count(authThrottleEvents.id) })
      .from(authThrottleEvents)
      .where(
        and(
          eq(authThrottleEvents.identifier, guestId),
          eq(authThrottleEvents.kind, 'promo_attempt'),
          gte(authThrottleEvents.createdAt, new Date(Date.now() - ATTEMPTS_PER_GUEST.windowMs)),
        ),
      );
    return Number(n) < ATTEMPTS_PER_GUEST.max;
  } catch (error) {
    reportError(error, { surface: 'promo-throttle:attemptAllowed' });
    return true;
  }
}

/** Record a promo attempt (before the lookup — attempts count, not successes). */
export async function recordPromoAttempt(guestId: string, ip: string | null): Promise<void> {
  if (!hasDb()) return;
  try {
    await db.insert(authThrottleEvents).values({ identifier: guestId, ip, kind: 'promo_attempt' });
  } catch (error) {
    reportError(error, { surface: 'promo-throttle:recordAttempt' });
  }
}
