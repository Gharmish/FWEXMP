import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  bookingFilterOrder,
  bookingFilterWhere,
  normalizeStatus,
  normalizeView,
} from '@/features/admin/bookings/lib/filter';

const dialect = new PgDialect({ casing: 'snake_case' });
const render = (q: SQL | undefined) => (q ? dialect.sqlToQuery(q) : { sql: '', params: [] });
const today = '2026-05-29';

describe('normalizeStatus / normalizeView', () => {
  it('accepts valid status, falls back to all', () => {
    expect(normalizeStatus('confirmed')).toBe('confirmed');
    expect(normalizeStatus('bogus')).toBe('all');
    expect(normalizeStatus(undefined)).toBe('all');
  });
  it('only upcoming is special', () => {
    expect(normalizeView('upcoming')).toBe('upcoming');
    expect(normalizeView('all')).toBe('all');
    expect(normalizeView(undefined)).toBe('all');
  });
});

describe('bookingFilterWhere (2026-09 engineering audit DATA-04)', () => {
  it('is no filter by default', () => {
    expect(bookingFilterWhere({ todayStr: today })).toBeUndefined();
  });

  it('filters by status', () => {
    const { sql, params } = render(bookingFilterWhere({ status: 'confirmed', todayStr: today }));
    expect(sql).toContain('"bookings"."status" = $1');
    expect(params).toEqual(['confirmed']);
  });

  it('upcoming keeps only future pending/confirmed rows, soonest first', () => {
    const { sql, params } = render(bookingFilterWhere({ view: 'upcoming', todayStr: today }));
    expect(sql).toContain('"bookings"."status" in ($1, $2)');
    expect(sql).toContain('"bookings"."date" >= $3');
    expect(params).toEqual(['pending', 'confirmed', today]);
    const order = bookingFilterOrder({ view: 'upcoming', todayStr: today }).map(
      (o) => render(o).sql,
    );
    expect(order).toEqual(['"bookings"."date" asc', '"bookings"."start_time" asc']);
    expect(bookingFilterOrder({ todayStr: today }).map((o) => render(o).sql)).toEqual([
      '"bookings"."created_at" desc',
    ]);
  });

  it('searches reference, short code, guest name and title case-insensitively', () => {
    const { sql, params } = render(bookingFilterWhere({ q: 'Dawn', todayStr: today }));
    expect(sql).toContain('"bookings"."idempotency_key" ilike $1');
    expect(sql).toContain('"guests"."name" ilike $3');
    expect(sql).toContain('"experiences"."title_en" ilike $4');
    expect(params).toEqual(['%dawn%', '%dawn%', '%dawn%', '%dawn%']);
  });

  it('searches phones by digits, with and without the local leading zero', () => {
    const { sql, params } = render(bookingFilterWhere({ q: '0512 345', todayStr: today }));
    expect(sql).toContain(
      'regexp_replace(coalesce("bookings"."contact_phone", "guests"."phone", \'\'), \'\\D\', \'\', \'g\') like',
    );
    expect(params).toContain('%0512345%');
    expect(params).toContain('%512345%');
  });

  it('escapes LIKE metacharacters in the needle', () => {
    const { params } = render(bookingFilterWhere({ q: '100%', todayStr: today }));
    expect(params[0]).toBe('%100\\%%');
  });

  it('the suspended-host queue composes with status and upcoming', () => {
    const { sql, params } = render(
      bookingFilterWhere({
        suspendedHost: true,
        status: 'confirmed',
        refundDue: true,
        todayStr: today,
      }),
    );
    expect(sql).toContain('"bookings"."refund_due_sar" is not null');
    expect(sql).toContain('"hosts"."verification_status" = $1');
    expect(params).toEqual(['suspended', 'pending', 'confirmed', today, 'confirmed']);
  });
});
