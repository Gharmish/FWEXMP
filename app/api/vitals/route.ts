import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { authThrottleEvents, WEB_VITAL_NAMES, WEB_VITAL_RATINGS, webVitals } from '@/db/schema';
import { collapseVitalsPath } from '@/features/analytics/vitals-path';

/** One beacon is a few hundred bytes; anything larger is not ours. */
const MAX_BODY_BYTES = 2048;
/**
 * Per-IP ingest cap. A real visit sends at most five vitals per page and
 * only one visit in four reports at all, so sixty in ten minutes is far
 * above any human — and the ceiling on what a scripted caller can insert
 * (2026-09 engineering audit, second-pass verification F15).
 */
const PER_IP = { max: 60, windowMs: 10 * 60_000 };

const vitalSchema = z.object({
  name: z.enum(WEB_VITAL_NAMES),
  value: z.number().min(0).max(120_000),
  rating: z.enum(WEB_VITAL_RATINGS),
  // A pathname-shaped string only; it is re-collapsed below so the
  // stored path is always a route template, whatever the caller sent.
  path: z
    .string()
    .min(1)
    .max(160)
    .regex(/^\/[A-Za-z0-9/_.\-\[\]]*$/),
  locale: z.enum(['en', 'ar']).nullable().optional(),
  navigationType: z.string().max(32).optional(),
});

function clientIp(request: Request): string | null {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * A beacon our own page sent: browsers stamp `Sec-Fetch-Site` on every
 * fetch/sendBeacon and `Origin` on every POST. Anything cross-site is
 * refused before the body is read; a scripted caller that forges the
 * headers is bounded by the per-IP cap instead.
 */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** Count this IP's recent beacons; below the cap, record this one and admit it. */
async function ipUnderCap(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - PER_IP.windowMs);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(authThrottleEvents)
    .where(
      and(
        eq(authThrottleEvents.ip, ip),
        eq(authThrottleEvents.kind, 'vital'),
        gte(authThrottleEvents.createdAt, since),
      ),
    );
  if ((row?.n ?? 0) >= PER_IP.max) return false;
  await db.insert(authThrottleEvents).values({ identifier: 'vital', ip, kind: 'vital' });
  return true;
}

/**
 * Real-user vitals ingest (2026-09 engineering audit ROADMAP-06). Fire-
 * and-forget from the browser: every outcome is a bodiless response, a
 * bad payload is a 400 the beacon never reads, and a storage failure is
 * reported but never surfaces to the visitor.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = vitalSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  if (!serverEnv.DATABASE_URL) return new Response(null, { status: 204 });
  const ip = clientIp(request);
  try {
    if (ip && !(await ipUnderCap(ip))) return new Response(null, { status: 429 });
    await db.insert(webVitals).values({
      name: parsed.data.name,
      value: parsed.data.value,
      rating: parsed.data.rating,
      path: collapseVitalsPath(parsed.data.path).path,
      locale: parsed.data.locale ?? null,
      navigationType: parsed.data.navigationType ?? null,
    });
  } catch (error) {
    reportError(error, { surface: 'vitals:ingest' });
  }
  return new Response(null, { status: 204 });
}
