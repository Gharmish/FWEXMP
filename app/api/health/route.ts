import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkDb } from '@/lib/db-health';
import { serverEnv } from '@/lib/env';
import { platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Health endpoint for an external monitor (2026-09 engineering audit
 * OPS-09). Public pages degrade to defaults when the database is down, so
 * an uptime probe pointed at `/` reports a healthy 200 while every
 * booking, sign-in and admin page is failing. This route answers 503 when
 * the database errors or the maintenance cron's heartbeat is older than
 * the same 3h threshold the watchdog and the admin banner use, giving the
 * platform a signal that does not depend on its own alert rails.
 *
 * Unauthenticated by design (monitors cannot hold secrets); it exposes no
 * data beyond "up/down", a latency figure and the deploy SHA.
 */

export const dynamic = 'force-dynamic';

const STALE_AFTER_MS = 3 * 3_600_000;

export async function GET(): Promise<NextResponse> {
  const dbHealth = await checkDb();
  let cronAgeMinutes: number | null = null;
  let cronStale = false;
  if (dbHealth.status === 'ok') {
    try {
      const [row] = await db
        .select({ at: platformSettings.lastCronRunAt })
        .from(platformSettings)
        .where(eq(platformSettings.id, 'platform'))
        .limit(1);
      const at = row?.at ?? null;
      cronAgeMinutes = at ? Math.round((Date.now() - at.getTime()) / 60_000) : null;
      cronStale = at === null || Date.now() - at.getTime() > STALE_AFTER_MS;
    } catch (error) {
      reportError(error, { surface: 'health:cron' });
      cronStale = true;
    }
  }

  const healthy = dbHealth.status !== 'error' && !(dbHealth.status === 'ok' && cronStale);
  return NextResponse.json(
    {
      ok: healthy,
      db:
        dbHealth.status === 'ok'
          ? { status: 'ok', latencyMs: dbHealth.latencyMs }
          : { status: dbHealth.status },
      cron: serverEnv.DATABASE_URL ? { ageMinutes: cronAgeMinutes, stale: cronStale } : null,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
