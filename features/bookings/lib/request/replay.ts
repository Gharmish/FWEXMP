import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import { isHoldExpired } from '@/features/bookings/lib/availability';

/**
 * Did this insert lose to an earlier booking with the same idempotency
 * key? postgres.js surfaces unique violations as code 23505 with the
 * constraint name; drizzle may wrap the driver error, so walk the cause
 * chain. Matched by name so a `reference_code` collision (also 23505)
 * still lands in the generic server-error path.
 */
export function isIdempotencyReplay(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: unknown; constraint_name?: unknown };
    if (pg.code === '23505' && pg.constraint_name === 'bookings_idempotencyKey_unique') {
      return true;
    }
  }
  return false;
}

/**
 * Step 2 — idempotent-replay fast path. If this key already created a
 * booking, a double-tap or network re-POST is re-delivering a request we
 * already served: land the guest on the existing booking BEFORE the
 * throttles (the first insert now counts toward them). Returns the path
 * to land on, or null when there is nothing to replay. A lookup hiccup
 * is reported and treated as "no replay" — the unique-constraint catch
 * in the insert path is the race-proof backstop.
 *
 * Landing matches where the WINNING submit landed (2026-08-02 ops audit
 * P2): a confirmed hold still awaiting payment goes back to the pay step
 * — same conditions createCheckout itself enforces (live hold, not paid,
 * no unresolved settle anomaly). Every other state belongs on the
 * confirmation page, which renders all of them.
 */
export async function replayLanding(
  reference: string,
  paths: { pay: string; confirmed: string },
): Promise<string | null> {
  let existing:
    | {
        status: string;
        paymentStatus: string;
        paymentDeadline: Date | null;
        settleAnomalyAt: Date | null;
      }
    | undefined;
  try {
    existing = await db.query.bookings.findFirst({
      where: (b) => eq(b.idempotencyKey, reference),
      columns: {
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        settleAnomalyAt: true,
      },
    });
  } catch (error) {
    reportError(error, { surface: 'booking-request:replayCheck', reference });
  }
  if (!existing) return null;
  const awaitingPayment =
    existing.status === 'confirmed' &&
    existing.paymentStatus !== 'paid' &&
    existing.settleAnomalyAt === null &&
    existing.paymentDeadline !== null &&
    !isHoldExpired(existing.paymentDeadline, new Date());
  return awaitingPayment ? paths.pay : paths.confirmed;
}
