import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNotNull, lte, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Scheduled release of expired payment holds (Vercel Cron — see vercel.json;
 * runs daily on the Hobby plan, which caps crons at once/day — tighten to a
 * sub-daily schedule on Pro, or trigger this endpoint from an external
 * scheduler).
 *
 * Cancels bookings whose payment window has passed **and are still `unpaid`**
 * (no checkout was ever prepared → no payment can be in flight). This frees
 * the spot for capacity (`cancelled` is not an active status) with no
 * late-settlement race: a `processing` booking is deliberately never touched
 * here, and `createCheckout` refuses any cancelled/expired hold, so a released
 * seat can never be charged.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. With no
 * secret set the route rejects everything, so the job is inert until
 * configured.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!serverEnv.DATABASE_URL) {
    return NextResponse.json({ released: 0, skipped: 'no-db' });
  }

  try {
    const released = await db
      .update(bookings)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(bookings.paymentStatus, 'unpaid'),
          isNotNull(bookings.paymentDeadline),
          lte(bookings.paymentDeadline, new Date()),
          notInArray(bookings.status, ['cancelled', 'completed', 'refunded']),
        ),
      )
      .returning({ id: bookings.id });

    return NextResponse.json({ released: released.length });
  } catch (error) {
    reportError(error, { surface: 'cron-release-holds' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
