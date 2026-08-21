import { after } from 'next/server';
import { headers } from 'next/headers';
import { sql, type SQL } from 'drizzle-orm';
import { getAnalyticsDb } from '@/lib/db';
import { analyticsEvents, experiences } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { withDeadline } from '@/lib/deadline';
import { getCurrentUser } from '@/features/auth/queries';
import { SITE_URL } from '@/lib/site';
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
 * stays true and no consent gate applies. What IS kept per event (all
 * non-identifying): locale, UTM triplet, external referrer hostname,
 * and a mobile/desktop flag.
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

/**
 * Requests that are not demand (2026-08-21 dashboard audit). Before this
 * filter, link-preview fetchers (every WhatsApp/X share re-fetches the
 * detail page), crawlers and our own QA sessions all counted as views —
 * three test days in August produced more "views" than a normal month.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|facebookexternalhit|whatsapp|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|pinterest|snapchat|vercel-screenshot|headless|lighthouse|pagespeed|curl|wget|python-requests|go-http-client|axios|node-fetch|okhttp|uptime|monitor/i;

const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
})();

interface RequestMeta {
  referrerHost: string | null;
  device: 'mobile' | 'desktop';
}

/**
 * Decide whether this request counts, and pull the anonymous request
 * facts we keep. Returns null to skip: bot/preview user agents, and
 * signed-in admins (our own browsing is not demand). Hosts are NOT
 * excluded — a host browsing the catalog is still a visitor.
 */
async function requestMeta(): Promise<RequestMeta | null> {
  const h = await headers();
  const ua = h.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return null;
  // Only the hostname of an EXTERNAL referrer is kept. Same-site
  // navigations (RSC fetches carry the previous page as Referer) and
  // typed/direct arrivals both read as null = direct.
  let referrerHost: string | null = null;
  const ref = h.get('referer');
  if (ref) {
    try {
      const host = new URL(ref).hostname.replace(/^www\./, '');
      if (host && host !== SITE_HOST && !host.endsWith('.vercel.app') && host !== 'localhost') {
        referrerHost = host.slice(0, 100);
      }
    } catch {
      // malformed Referer — treat as direct
    }
  }
  const device: RequestMeta['device'] = /mobile|android|iphone|ipad|ipod/i.test(ua)
    ? 'mobile'
    : 'desktop';
  // getCurrentUser is request-cached; the navbar has already paid for it.
  const user = await getCurrentUser().catch(() => null);
  if (user?.isAdmin) return null;
  return { referrerHost, device };
}

// $inferInsert types experienceId as string|null, but drizzle's .values()
// accepts a per-column SQL expression — used to resolve slug→id in-statement.
type NewEvent = Omit<typeof analyticsEvents.$inferInsert, 'experienceId'> & {
  experienceId?: SQL | string | null;
};

/**
 * Request facts are resolved BEFORE `after()` is scheduled: Server
 * Components may not touch `headers()`/`cookies()` inside an `after`
 * callback. Both reads are cheap (in-memory headers; the session read is
 * request-cached and needs no network for anonymous visitors), so the
 * page waits microseconds, and the DB insert still runs post-response.
 */
async function record(event: NewEvent): Promise<void> {
  if (!serverEnv.DATABASE_URL) return;
  let meta: RequestMeta | null;
  try {
    meta = await requestMeta();
  } catch (error) {
    reportError(error, { surface: 'analytics:requestMeta', type: event.type });
    return;
  }
  if (!meta) return;
  event = { ...event, referrerHost: meta.referrerHost, device: meta.device };
  after(async () => {
    try {
      // Isolated pool + hard deadline: post-response writes must never be
      // able to poison or hold the shared pool (see getAnalyticsDb), and a
      // stuck write should surface in Sentry, not linger silently.
      await withDeadline(
        'analytics:insert',
        5_000,
        getAnalyticsDb().insert(analyticsEvents).values(event).execute(),
      );
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
}): Promise<void> {
  return record({
    type: 'experience_view',
    experienceId: sql`(select ${experiences.id} from ${experiences} where ${experiences.slug} = ${input.experienceSlug})`,
    locale: input.locale,
    utmSource: input.utm.source,
    utmMedium: input.utm.medium,
    utmCampaign: input.utm.campaign,
  });
}

/**
 * A public non-listing page was served: home, catalog browse (no
 * filters), /hosting, /abha, host profiles. `path` is the ROUTE template
 * (`/hosts/[slug]`), not the concrete URL, so the dashboard can roll
 * pages up and nothing about the visitor's exact path is stored.
 */
export function trackPageView(input: {
  path: string;
  locale: string;
  utm: UtmParams;
}): Promise<void> {
  return record({
    type: 'page_view',
    path: input.path.slice(0, 100),
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
}): Promise<void> {
  return record({
    type: 'search',
    searchQuery: input.query.slice(0, 300),
    resultCount: input.resultCount,
    locale: input.locale,
    utmSource: input.utm.source,
    utmMedium: input.utm.medium,
    utmCampaign: input.utm.campaign,
  });
}
