import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { experiences } from '@/db/schema';

/**
 * BOOKING-02 (2026-10-17 scan): a booking outlives its listing's status.
 * The public detail read is live-only by design; the booking surfaces
 * must use the any-status read, or pausing a listing blanks the title,
 * meeting point and map on every booking already made.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));

const captured = vi.hoisted(() => ({
  findFirst: [] as Array<{ where?: (fields: typeof experiences) => unknown }>,
}));
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      experiences: {
        findFirst: async (args: { where?: (fields: typeof experiences) => unknown }) => {
          captured.findFirst.push(args);
          return undefined;
        },
        findMany: async () => [],
      },
    },
  },
}));
vi.mock('@/lib/deadline', () => ({
  boundedQuery: async <T>(_key: string, fn: () => Promise<T>) => fn(),
}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://x' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/features/reviews/queries', () => ({
  getRatingsBySlug: async () => new Map(),
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => null }));
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => null }));

import { getExperienceBySlug, getExperienceForBooking } from './queries';

const render = (where: ((fields: typeof experiences) => unknown) | undefined): string => {
  if (!where) throw new Error('query had no where clause');
  // The relational callback receives the table's columns; the table object
  // exposes them as properties, so it stands in for `fields` here.
  const built = where(experiences);
  return new PgDialect().sqlToQuery(built as Parameters<PgDialect['sqlToQuery']>[0]).sql;
};

describe('listing reads by slug', () => {
  it('the public detail read stays live-only while the booking read takes any status', async () => {
    await getExperienceBySlug('sunrise-hike');
    await getExperienceForBooking('sunrise-hike');
    expect(captured.findFirst).toHaveLength(2);
    const [publicWhere, bookingWhere] = captured.findFirst.map((a) => render(a.where));
    expect(publicWhere).toContain('"status"');
    expect(bookingWhere).toContain('"slug"');
    expect(bookingWhere).not.toContain('"status"');
  });
});

describe('booking surfaces read the listing at any status (structural)', () => {
  const anyStatusOnly = [
    'features/bookings/lib/booking-email-shared.ts',
    'features/bookings/lib/booking-email-guest.ts',
    'features/bookings/lib/booking-email-receipt.ts',
    'features/bookings/lib/booking-email-reminders.ts',
    'features/account/queries.ts',
    'app/[locale]/(site)/book/confirmed/[ref]/page.tsx',
    'app/[locale]/(site)/book/confirmed/[ref]/invoice/page.tsx',
    'app/api/bookings/[ref]/calendar/route.ts',
  ];

  it.each(anyStatusOnly)('%s uses getExperienceForBooking and never the live-only read', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('getExperienceForBooking(');
    expect(source).not.toContain('getExperienceBySlug(');
  });

  it('the pay page reads the booking slug at any status and keeps the URL fallback live-only', () => {
    const source = readFileSync('app/[locale]/(site)/book/[reference]/pay/page.tsx', 'utf8');
    expect(source).toContain('getExperienceForBooking(booking.experienceSlug)');
    expect(source).toContain('getExperienceBySlug(slugFromQuery)');
  });
});
