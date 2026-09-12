import 'server-only';

import { count, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { WEB_VITAL_NAMES, webVitals, type WebVitalName, type WebVitalRating } from '@/db/schema';
import { rateVital } from '@/features/admin/analytics/vitals';

export interface WebVitalSummaryRow {
  name: WebVitalName;
  /** 75th percentile of the window's samples; null when there are none. */
  p75: number | null;
  samples: number;
  rating: WebVitalRating | null;
}

export interface WebVitalsSummary {
  last7d: WebVitalSummaryRow[];
  last28d: WebVitalSummaryRow[];
}

async function windowSummary(sinceMs: number): Promise<WebVitalSummaryRow[]> {
  const rows = await db
    .select({
      name: webVitals.name,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${webVitals.value})::float8`,
      samples: count(),
    })
    .from(webVitals)
    .where(gte(webVitals.createdAt, new Date(Date.now() - sinceMs)))
    .groupBy(webVitals.name);
  const byName = new Map(rows.map((r) => [r.name, r]));
  return WEB_VITAL_NAMES.map((name) => {
    const row = byName.get(name);
    const p75 = row?.p75 ?? null;
    return {
      name,
      p75,
      samples: row?.samples ?? 0,
      rating: p75 === null ? null : rateVital(name, p75),
    };
  });
}

/** p75 per Core Web Vital over the last 7 and 28 days (ROADMAP-06). Null on failure. */
export async function getWebVitalsSummary(): Promise<WebVitalsSummary | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    const DAY = 24 * 3_600_000;
    const [last7d, last28d] = await Promise.all([windowSummary(7 * DAY), windowSummary(28 * DAY)]);
    return { last7d, last28d };
  } catch (error) {
    reportError(error, { surface: 'admin:analytics:vitals' });
    return null;
  }
}
