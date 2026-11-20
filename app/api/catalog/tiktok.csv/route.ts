import type { NextRequest } from 'next/server';
import { getExperiences } from '@/features/experiences/queries';
import { getLiveScheduleData, type ScheduleData } from '@/features/availability/queries';
import {
  BOOKING_HORIZON_DAYS,
  addDays,
  bookableDates,
  nowMinutesInRiyadh,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { SITE_URL } from '@/lib/site';
import { csvCell } from '@/lib/csv';

/**
 * TikTok catalog data feed — the scheduled-fetch source for the
 * "Gharmish experiences" catalog in TikTok Catalog Manager, so the
 * catalog tracks the live experience set automatically (new listings
 * appear, price edits propagate, unlisted experiences drop out).
 *
 * Column set = TikTok's standard e-commerce template. `sku_id` is the
 * experience slug ON PURPOSE: it must equal the `content_id` the pixel
 * sends (see `lib/funnel-tracking.ts`) for product-to-event matching.
 * Public by design — TikTok's fetcher is anonymous. Reads go through
 * the same cached, deadline-bounded loader as the public catalog pages.
 *
 * `?locale=ar` emits the Arabic titles/descriptions and `/ar/` landing
 * links (same sku_ids — one catalog, two localized feeds) so Arabic ad
 * units stop showing English cards in an Arabic-majority market. The
 * Arabic fields are already fallback-safe: the query layer substitutes
 * English wherever the Arabic column still holds the TODO(ar) scaffold.
 *
 * Rows without a hero image are SKIPPED, not emitted empty — TikTok
 * rejects an empty image_link row-by-row, which silently kept those
 * products out of the catalog anyway; skipping makes the drop explicit
 * and keeps the feed valid. Relative image paths are absolutized (the
 * detail page guards `startsWith('http')` for the same reason).
 *
 * `availability` is derived from the live schedule (issue #303,
 * 2026-11-04): a listing is `in stock` only when it has at least one
 * bookable date in the booking horizon, by the same `bookableDates` rule
 * the detail page uses for its Product JSON-LD, so the feed and the
 * landing page never contradict each other for the same SKU. The
 * schedules come from one batch read. A live listing missing from that
 * read is `out of stock` (an ad for an unbookable listing costs more
 * than a paused one). When the read itself is unavailable (no DB, or a
 * failed query) the feed answers 503 with `no-store` instead of a
 * catalog that pauses every product: the CDN would cache that for an
 * hour and TikTok's scheduled fetch would ingest it until its next run,
 * whereas a failed fetch keeps the last good catalog.
 */

// No `revalidate` export: reading `request.nextUrl.searchParams` makes the
// handler dynamic, so the segment option was inert — the CDN header below is
// what actually caches the feed (2026-09 engineering audit GAPB-07).

/**
 * One cell: whitespace collapsed to single spaces (TikTok wants one-line
 * titles), then the shared RFC-4180 writer, which also defuses formula
 * triggers — host-authored titles go into a CSV operators will open in
 * Excel sooner or later.
 */
function field(value: string): string {
  return csvCell(value.replaceAll(/\s+/g, ' ').trim());
}

function absoluteImage(heroImage: string): string {
  if (heroImage.startsWith('http')) return heroImage;
  return `${SITE_URL}${heroImage.startsWith('/') ? '' : '/'}${heroImage}`;
}

/** TikTok's `availability` column: `in stock` only with a bookable date in the horizon. */
function stockLabel(
  schedule: ScheduleData | undefined,
  todayRiyadh: string,
  nowMinutes: number,
): 'in stock' | 'out of stock' {
  if (!schedule) return 'out of stock';
  const dates = bookableDates({
    fromStr: todayRiyadh,
    days: BOOKING_HORIZON_DAYS + 1,
    availabilityWeekdays: schedule.availabilityWeekdays,
    blackoutDates: schedule.blackoutDates,
    stopSellDates: schedule.stopSellDates,
    maxGroupSize: schedule.maxGroupSize,
    bookedByDate: schedule.bookedByDate,
    startTime: schedule.startTime,
    nowMinutes,
    cutoffMinutes: schedule.bookingCutoffHours * 60,
  });
  return dates.length > 0 ? 'in stock' : 'out of stock';
}

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const todayRiyadh = todayInRiyadh();
  const nowMinutes = nowMinutesInRiyadh();
  const [experiences, schedules] = await Promise.all([
    getExperiences(),
    getLiveScheduleData(todayRiyadh, addDays(todayRiyadh, BOOKING_HORIZON_DAYS)),
  ]);
  if (!schedules) {
    return new Response('availability unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const header =
    'sku_id,title,description,availability,condition,price,link,image_link,brand,product_type';
  const rows = experiences
    .filter((e) => Boolean(e.heroImage))
    .map((e) =>
      [
        field(e.slug),
        field(locale === 'ar' ? e.titleAr : e.titleEn),
        field(locale === 'ar' ? e.descriptionAr : e.descriptionEn),
        stockLabel(schedules.get(e.id), todayRiyadh, nowMinutes),
        'new',
        `${e.priceSar.toFixed(2)} SAR`,
        field(`${SITE_URL}/${locale}/experiences/${e.slug}`),
        // Non-null by the filter above; narrowing doesn't cross the
        // callback boundary, hence the fallback.
        field(absoluteImage(e.heroImage ?? '')),
        'Gharmish',
        field(`Experiences > ${e.category.replaceAll('_', ' ')}`),
      ].join(','),
    );
  return new Response([header, ...rows].join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
