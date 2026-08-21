import 'server-only';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { withDeadline } from '@/lib/deadline';
import { comparison, type DateRange } from '@/features/admin/dashboard/lib/date-range';
import type { Delta } from '@/features/admin/dashboard/metrics-types';

/**
 * Site-level traffic from Vercel Web Analytics — unique visitors, page
 * views, top countries and referrers. This is the one number the
 * first-party `analytics_events` capture cannot produce: it stores no
 * session key (cookie-notice promise), so it counts served pages, not
 * people. Vercel's script is cookieless and hashes per-day, which is why
 * it may sit outside the consent gate AND still report visitors.
 *
 * Reads `https://api.vercel.com/v1/query/web-analytics/visits/*` with a
 * token scoped to the team. Optional integration: no token → `null`, and
 * the dashboard card renders its "not connected" state.
 */

export const VERCEL_TEAM_ID = 'team_MUyPisiHSaQ5UqZsnIhhhbjs';
export const VERCEL_PROJECT_ID = 'prj_mGiFyMvVm5PSg4Nkb7x0wefqaWya';
export const VERCEL_ANALYTICS_URL = 'https://vercel.com/gharmish-3685s-projects/gharmish/analytics';

const API = 'https://api.vercel.com/v1/query/web-analytics/visits';
/** Vercel aggregates lag a few minutes anyway; a 10-minute cache keeps the admin page off their rate limit. */
const REVALIDATE_SECONDS = 600;

export interface TrafficDimensionRow {
  label: string;
  visitors: number;
  pageviews: number;
}

export interface SiteTraffic {
  visitors: Delta;
  pageviews: Delta;
  /**
   * False when the comparison window falls (even partly) outside what the
   * plan retains — the UI then hides the growth badges instead of
   * comparing against a silently empty period.
   */
  hasComparison: boolean;
  /**
   * Set when the selected range was clamped to the retention window
   * (`YYYY-MM-DD` of the earliest day actually queried). Vercel Hobby
   * keeps 31 days; a 90-day preset is answered for the last 31.
   */
  clampedFrom: string | null;
  topCountries: readonly TrafficDimensionRow[];
  topReferrers: readonly TrafficDimensionRow[];
  topPaths: readonly TrafficDimensionRow[];
}

export function vercelAnalyticsConfigured(): boolean {
  return serverEnv.VERCEL_ANALYTICS_TOKEN !== '';
}

interface CountResponse {
  data?: { visitors?: number; pageviews?: number };
}
interface AggregateResponse {
  data?: Array<Record<string, unknown> & { visitors?: number; pageviews?: number; count?: number }>;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set('teamId', VERCEL_TEAM_ID);
  url.searchParams.set('projectId', VERCEL_PROJECT_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${serverEnv.VERCEL_ANALYTICS_TOKEN}` },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`vercel analytics ${path}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Inclusive day bounds, per endpoint — the two endpoints parse `until`
 * DIFFERENTLY (verified against the live API 2026-08-21, read the echoed
 * `query.until` if this ever regresses):
 *   - count:     date-only `until` → next midnight (whole day included);
 *                a `T23:59:59.999Z` timestamp is truncated to 00:00 and
 *                the window comes back EMPTY.
 *   - aggregate: date-only `until` → only the first HOUR of that day;
 *                `T23:59:59.999Z` → next midnight, as wanted.
 * Days are UTC here while the dashboard range is Riyadh-local (UTC+3);
 * the 3h skew is accepted for a traffic card.
 */
function countBounds(r: DateRange): { since: string; until: string } {
  return { since: r.from, until: r.to };
}
function aggregateBounds(r: DateRange): { since: string; until: string } {
  return { since: `${r.from}T00:00:00.000Z`, until: `${r.to}T23:59:59.999Z` };
}

function count(r: DateRange): Promise<CountResponse> {
  return call<CountResponse>('count', countBounds(r));
}

function aggregate(r: DateRange, by: string, limit: number): Promise<AggregateResponse> {
  return call<AggregateResponse>('aggregate', { ...aggregateBounds(r), by, limit: String(limit) });
}

function rows(res: AggregateResponse, key: string): TrafficDimensionRow[] {
  return (res.data ?? [])
    .map((d) => ({
      label: String(d[key] ?? '') || 'unknown',
      visitors: Number(d.visitors ?? 0),
      pageviews: Number(d.pageviews ?? d.count ?? 0),
    }))
    .filter((d) => d.pageviews > 0)
    .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews);
}

/**
 * Days of history the plan serves. Hobby = 31 (the API answers HTTP 400
 * "only grants access to the latest 31 days" beyond it, verified
 * 2026-08-21). One day of slack for the UTC/Riyadh skew.
 */
const RETENTION_DAYS = 30;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch the card's data for the dashboard's selected range plus the
 * comparison window. Five small requests, parallel, one deadline: a slow
 * or failing Vercel API must degrade this card alone, never the page.
 */
export async function getSiteTraffic(range: DateRange): Promise<SiteTraffic | null> {
  if (!vercelAnalyticsConfigured()) return null;
  const earliest = addDaysIso(todayUtc(), -RETENTION_DAYS);
  const clamped = range.from < earliest;
  const cur_: DateRange = clamped ? { ...range, from: earliest } : range;
  const prev = comparison(range);
  const hasComparison = !clamped && prev.from >= earliest;
  try {
    const [cur, before, countries, referrers, paths] = await withDeadline(
      'vercel:analytics',
      6_000,
      Promise.all([
        count(cur_),
        hasComparison ? count(prev) : Promise.resolve<CountResponse>({}),
        aggregate(cur_, 'country', 5),
        aggregate(cur_, 'referrerHostname', 6),
        aggregate(cur_, 'requestPath', 6),
      ]),
    );
    return {
      visitors: { current: cur.data?.visitors ?? 0, previous: before.data?.visitors ?? 0 },
      pageviews: { current: cur.data?.pageviews ?? 0, previous: before.data?.pageviews ?? 0 },
      hasComparison,
      clampedFrom: clamped ? earliest : null,
      topCountries: rows(countries, 'country'),
      topReferrers: rows(referrers, 'referrerHostname'),
      topPaths: rows(paths, 'requestPath'),
    };
  } catch (error) {
    reportError(error, { surface: 'admin:vercelAnalytics' });
    return null;
  }
}
