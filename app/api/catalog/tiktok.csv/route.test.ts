import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ScheduleData } from '@/features/availability/types';
import type { ExperienceSummary } from '@/features/experiences/types';
import { addDays, todayInRiyadh } from '@/lib/riyadh-time';

/**
 * The feed's `availability` column must follow the live schedule (issue
 * #303): the detail page already tells crawlers `SoldOut` for a listing
 * with no bookable date, and a feed that says `in stock` for the same SKU
 * is a landing-page mismatch that sends paid traffic to a page nobody
 * can book from.
 */

const experiences = vi.hoisted(() => ({ getExperiences: vi.fn() }));
vi.mock('@/features/experiences/queries', () => experiences);

const availability = vi.hoisted(() => ({ getLiveScheduleData: vi.fn() }));
vi.mock('@/features/availability/queries', () => availability);

import { GET } from './route';

// 00:30 Riyadh on Thursday 2026-11-05 — still 2026-11-04 in UTC, so a
// UTC-based "today" would be caught; and well before any start time, so
// the same-day cutoff never decides a case below.
const NOW = new Date('2026-11-04T21:30:00.000Z');
const TODAY_RIYADH = '2026-11-05';

function summary(id: string, slug: string): ExperienceSummary {
  return {
    id,
    slug,
    titleEn: `Walk ${slug}`,
    titleAr: `جولة ${slug}`,
    descriptionEn: 'A walk.',
    descriptionAr: 'جولة.',
    category: 'nature',
    priceSar: 150,
    durationMinutes: 120,
    startTime: '16:00',
    placeName: 'Soudah',
    city: 'Abha',
    maxGroupSize: 8,
    availabilityWeekdays: [0, 1, 2, 3, 4, 5, 6],
    hostName: 'Host',
    hostSlug: 'host',
    featured: false,
    bookingMode: 'instant',
    ratingAverage: null,
    ratingCount: 0,
    heroImage: '/images/walk.jpg',
    images: [],
    isNew: false,
  };
}

function schedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    availabilityWeekdays: [0, 1, 2, 3, 4, 5, 6],
    blackoutDates: [],
    stopSellDates: [],
    maxGroupSize: 8,
    startTime: '16:00',
    bookingCutoffHours: 2,
    bookedByDate: {},
    ...overrides,
  };
}

async function feedRows(locale = 'en'): Promise<Map<string, string[]>> {
  const res = await GET(
    new NextRequest(`https://gharmish.com/api/catalog/tiktok.csv?locale=${locale}`),
  );
  expect(res.status).toBe(200);
  const lines = (await res.text()).trim().split('\n');
  expect(lines[0]).toBe(
    'sku_id,title,description,availability,condition,price,link,image_link,brand,product_type',
  );
  const rows = new Map<string, string[]>();
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    rows.set(cells[0], cells);
  }
  return rows;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  experiences.getExperiences.mockReset();
  availability.getLiveScheduleData.mockReset();
  experiences.getExperiences.mockResolvedValue([
    summary('exp-open', 'open-walk'),
    summary('exp-closed', 'closed-walk'),
  ]);
});
afterEach(() => vi.useRealTimers());

describe('GET /api/catalog/tiktok.csv availability', () => {
  it('says "out of stock" for a live listing with no bookable date and "in stock" for one that has one', async () => {
    availability.getLiveScheduleData.mockResolvedValue(
      new Map<string, ScheduleData>([
        ['exp-open', schedule()],
        // Live but unbookable: no availability weekdays (the production
        // state of every live listing on 2026-11-04).
        ['exp-closed', schedule({ availabilityWeekdays: [] })],
      ]),
    );
    const rows = await feedRows();
    expect(rows.get('open-walk')?.[3]).toBe('in stock');
    expect(rows.get('closed-walk')?.[3]).toBe('out of stock');
  });

  it('asks for the schedules of the booking horizon, from today in Riyadh', async () => {
    availability.getLiveScheduleData.mockResolvedValue(new Map());
    await feedRows();
    expect(availability.getLiveScheduleData).toHaveBeenCalledTimes(1);
    expect(todayInRiyadh(NOW)).toBe(TODAY_RIYADH);
    expect(availability.getLiveScheduleData).toHaveBeenCalledWith(TODAY_RIYADH, '2027-01-04');
  });

  it('counts a fully booked horizon and a stop-sold horizon as out of stock, like the detail page', async () => {
    const horizon: string[] = [];
    for (let i = 0; i <= 60; i++) horizon.push(addDays(TODAY_RIYADH, i));
    availability.getLiveScheduleData.mockResolvedValue(
      new Map<string, ScheduleData>([
        [
          'exp-open',
          schedule({
            maxGroupSize: 2,
            bookedByDate: Object.fromEntries(horizon.map((d) => [d, 2])),
          }),
        ],
        ['exp-closed', schedule({ stopSellDates: horizon })],
      ]),
    );
    const rows = await feedRows();
    expect(rows.get('open-walk')?.[3]).toBe('out of stock');
    expect(rows.get('closed-walk')?.[3]).toBe('out of stock');
  });

  it('answers 503 without caching when the schedule read is unavailable, so the fetcher keeps its last good catalog', async () => {
    availability.getLiveScheduleData.mockResolvedValue(null);
    const res = await GET(new NextRequest('https://gharmish.com/api/catalog/tiktok.csv?locale=ar'));
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toContain('in stock');
  });

  it('treats a live listing missing from the batch as out of stock', async () => {
    availability.getLiveScheduleData.mockResolvedValue(
      new Map<string, ScheduleData>([['exp-open', schedule()]]),
    );
    const rows = await feedRows();
    expect(rows.get('open-walk')?.[3]).toBe('in stock');
    expect(rows.get('closed-walk')?.[3]).toBe('out of stock');
  });
});
