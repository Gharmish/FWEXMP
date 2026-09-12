import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { WEB_VITAL_NAMES, WEB_VITAL_RATINGS, webVitals } from '@/db/schema';

/** One beacon is a few hundred bytes; anything larger is not ours. */
const MAX_BODY_BYTES = 2048;

const vitalSchema = z.object({
  name: z.enum(WEB_VITAL_NAMES),
  value: z.number().min(0).max(120_000),
  rating: z.enum(WEB_VITAL_RATINGS),
  path: z.string().min(1).max(160),
  locale: z.enum(['en', 'ar']).nullable().optional(),
  navigationType: z.string().max(32).optional(),
});

/**
 * Real-user vitals ingest (2026-09 engineering audit ROADMAP-06). Fire-
 * and-forget from the browser: every outcome is a bodiless response, a
 * bad payload is a 400 the beacon never reads, and a storage failure is
 * reported but never surfaces to the visitor.
 */
export async function POST(request: Request): Promise<Response> {
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
  try {
    await db.insert(webVitals).values({
      name: parsed.data.name,
      value: parsed.data.value,
      rating: parsed.data.rating,
      path: parsed.data.path,
      locale: parsed.data.locale ?? null,
      navigationType: parsed.data.navigationType ?? null,
    });
  } catch (error) {
    reportError(error, { surface: 'vitals:ingest' });
  }
  return new Response(null, { status: 204 });
}
