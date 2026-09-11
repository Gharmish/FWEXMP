import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { platformSettings } from '@/db/schema';
import { notifyAdmin } from '@/lib/admin-alerts';
import { reportError } from '@/lib/log';

/**
 * Cron watchdog (2026-08-02 ops audit P0-7). The release-holds job is
 * the platform's heartbeat — expiry, hold release, reconciliation,
 * reminders, completion, and wallet expiry all live in it — and its
 * staleness signal used to be a banner on /admin that an operator had
 * to LOAD to see. That is exactly how the 2026-07-08 incident stayed
 * invisible for three weeks: the hourly scheduler 401'd on every call
 * while nobody happened to look at the dashboard.
 *
 * This route pushes the same 3h staleness check (the threshold the
 * dashboard banner uses — tighter than the hourly schedule it watches)
 * out through `notifyAdmin`, i.e. email + the WhatsApp alert rail.
 *
 * It is deliberately a SEPARATE route from release-holds: a watchdog
 * inside the job it watches can never report that job's death. It is
 * scheduled from BOTH sides — Vercel Cron daily (survives a pg_cron
 * outage within 24h) and Supabase pg_cron hourly at :30
 * (supabase/watchdog-hourly-cron.sql — catches a dead main job within
 * ~1.5h). While the stamp stays stale, every watchdog run re-alerts:
 * that repetition is intentional escalation, not noise — it stops the
 * moment the main job runs once.
 *
 * Auth: identical to release-holds — `Authorization: Bearer
 * <CRON_SECRET>`; inert until the secret is configured.
 */

const STALE_AFTER_MS = 3 * 3_600_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.CRON_SECRET;
  const provided = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authorized =
    Boolean(secret) &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!serverEnv.DATABASE_URL) {
    return NextResponse.json({ stale: false, skipped: 'no-db' });
  }

  try {
    const [row] = await db
      .select({ at: platformSettings.lastCronRunAt })
      .from(platformSettings)
      .where(eq(platformSettings.id, 'platform'))
      .limit(1);
    const lastRunAt = row?.at ?? null;
    const ageMs = lastRunAt ? Date.now() - lastRunAt.getTime() : null;
    // Never stamped counts as stale: a deploy where the main job has
    // never run is precisely the misconfiguration this exists to catch.
    const stale = ageMs === null || ageMs > STALE_AFTER_MS;

    if (stale) {
      await notifyAdmin('cron_stale', {
        lastRunAt: lastRunAt ? lastRunAt.toISOString() : 'never',
        ageHours: ageMs === null ? null : Math.round(ageMs / 3_600_000),
        thresholdHours: STALE_AFTER_MS / 3_600_000,
      });
    }

    return NextResponse.json({
      stale,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    });
  } catch (error) {
    reportError(error, { surface: 'cron-watchdog' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
