import { describe, expect, it, vi } from 'vitest';
import { PgDialect, alias } from 'drizzle-orm/pg-core';
import { bookings } from '@/db/schema';

vi.mock('server-only', () => ({}));

import { holdStillCounts } from './capacity-sql';

// Render with the app's snake_case casing (lib/db.ts) so the assertions
// read like the SQL Postgres actually sees.
const dialect = new PgDialect({ casing: 'snake_case' });
const render = (q: ReturnType<typeof holdStillCounts>) => dialect.sqlToQuery(q).sql;

describe('holdStillCounts (2026-09 engineering audit GAPA-07)', () => {
  it('renders against the bookings table by default', () => {
    const sqlText = render(holdStillCounts());
    expect(sqlText).toContain('"bookings"."payment_status" in (\'unpaid\', \'failed\')');
    expect(sqlText).toContain('"bookings"."approval_deadline" <= now()');
  });

  it('renders the same predicate against an aliased table', () => {
    const other = alias(bookings, 'other');
    const sqlText = render(holdStillCounts(other));
    expect(sqlText).toContain('"other"."payment_status" in (\'unpaid\', \'failed\')');
    expect(sqlText).toContain('"other"."status" = \'pending\'');
    expect(sqlText).not.toContain('"bookings".');
  });
});
