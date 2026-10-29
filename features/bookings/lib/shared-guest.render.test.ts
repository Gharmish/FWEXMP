import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The not-shared guard (issue #120) is a `NOT EXISTS` subquery that
 * correlates `bookings.guest_id` with the row being updated. The db fake
 * never renders SQL, so this suite routes the real builder through the
 * pg-proxy driver and pins the correlated, qualified form: a bare `"id"`
 * inside the subquery would silently compare bookings to themselves.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  executed: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      return { rows: [] };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db };
});

import { db } from '@/lib/db';
import { guests } from '@/db/schema';
import { guestRowIsShared, noOtherBookingOnGuestRow } from './shared-guest';

describe('noOtherBookingOnGuestRow renders a correlated NOT EXISTS', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('passes an account-linked row, else excludes the caller’s booking and correlates on the updated row', async () => {
    await db
      .update(guests)
      .set({ email: 'sara@example.com' })
      .where(and(eq(guests.id, 'g1'), isNull(guests.authUserId), noOtherBookingOnGuestRow('b1')));

    expect(state.executed).toHaveLength(1);
    const { sql, params } = state.executed[0];
    expect(sql).toContain('update "guests" set "email" = $1');
    expect(sql).toContain('"guests"."id" = $2');
    expect(sql).toContain('"guests"."auth_user_id" is null');
    expect(sql).toContain(
      '("guests"."auth_user_id" is not null or not exists (select 1 from "bookings" where ("bookings"."guest_id" = "guests"."id" and "bookings"."id" <> $3)))',
    );
    expect(params).toEqual(['sara@example.com', 'g1', 'b1']);
  });

  it('counts every booking on the row when there is no booking to exclude yet', async () => {
    await db
      .update(guests)
      .set({ email: 'sara@example.com' })
      .where(and(eq(guests.id, 'g1'), noOtherBookingOnGuestRow(null)));

    const { sql } = state.executed[0];
    expect(sql).toContain(
      '("guests"."auth_user_id" is not null or not exists (select 1 from "bookings" where "bookings"."guest_id" = "guests"."id"))',
    );
  });
});

describe('guestRowIsShared', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('asks for one other booking on the row', async () => {
    expect(await guestRowIsShared('g1', 'b1')).toBe(false);
    const { sql, params } = state.executed[0];
    expect(sql).toContain(
      'from "bookings" where ("bookings"."guest_id" = $1 and "bookings"."id" <> $2) limit $3',
    );
    expect(params).toEqual(['g1', 'b1', 1]);
  });

  it('asks for any booking on the row when nothing is excluded', async () => {
    await guestRowIsShared('g1', null);
    const { sql, params } = state.executed[0];
    expect(sql).toContain('from "bookings" where "bookings"."guest_id" = $1 limit $2');
    expect(params).toEqual(['g1', 1]);
  });
});
