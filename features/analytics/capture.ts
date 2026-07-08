import { after } from 'next/server';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsEvents, experiences } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import type { UtmParams } from '@/features/analytics/types';

/**
 * First-party funnel capture (P0: the admin dashboard was blind above the
 * booking request — no traffic, no view→request conversion, no unserved
 * demand signal). Writes go to `analytics_events` via `after()`, so they
 * run once the response has flushed: a slow or failing insert can never
 * add latency to a guest-facing page, and errors only reach Sentry.
 *
 * Deliberately anonymous — no user id, no session key, no IP — so the
 * cookie-notice promise ("no advertising or tracking cookies, ever")
 * stays true and no consent gate applies.
 */

type SearchParamsShape = Readonly<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string | null => {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return null;
  // Attribution labels, not free text: clamp and drop control characters.
  const clean = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100);
  return clean || null;
};

/** Pull the UTM triplet out of a page's resolved `searchParams`. */
export function utmFromSearchParams(sp: SearchParamsShape): UtmParams {
  return {
    source: one(sp.utm_source),
    medium: one(sp.utm_medium),
    campaign: one(sp.utm_campaign),
  };
}

// $inferInsert types experienceId as string|null, but drizzle's .values()
// accepts a per-column SQL expression — used to resolve slug→id in-statement.
type NewEvent = Omit<typeof analyticsEvents.$inferInsert, 'experienceId'> & {
  experienceId?: SQL | string | null;
};

function record(event: NewEvent): void {
  if (!serverEnv.DATABASE_URL) return;
  after(async () => {
    try {
      await db.insert(analyticsEvents).values(event);
    } catch (error) {
      reportError(error, { surface: 'analytics:record', type: event.type });
    }
  });
}

/**
 * An experience detail page was served. Takes the slug (the domain types
 * deliberately don't expose row ids); the insert resolves it in-statement,
 * so the page pays no extra round-trip.
 */
export function trackExperienceView(input: {
  experienceSlug: string;
  locale: string;
  utm: UtmParams;
}): void {
  record({
    type: 'experience_view',
    experienceId: sql`(select ${experiences.id} from ${experiences} where ${experiences.slug} = ${input.experienceSlug})`,
    locale: input.locale,
    utmSource: input.utm.source,
    utmMedium: input.utm.medium,
    utmCampaign: input.utm.campaign,
  });
}

/**
 * The catalog was served with a search/filter applied. Callers only fire
 * this when at least one criterion is active — the bare catalog page is
 * browsing, not searching, and would drown the zero-results signal.
 */
export function trackSearch(input: {
  query: string;
  resultCount: number;
  locale: string;
  utm: UtmParams;
}): void {
  record({
    type: 'search',
    searchQuery: input.query.slice(0, 300),
    resultCount: input.resultCount,
    locale: input.locale,
    utmSource: input.utm.source,
    utmMedium: input.utm.medium,
    utmCampaign: input.utm.campaign,
  });
}
