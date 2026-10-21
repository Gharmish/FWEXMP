import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { paymentNudgeWindow } from './nudge-window';

/** Rendered with the production casing (see lib/db.ts). */
const render = () => new PgDialect({ casing: 'snake_case' }).sqlToQuery(paymentNudgeWindow());

describe('paymentNudgeWindow (COMMS-02)', () => {
  it('keeps the 150-minute lead and requires a hold at least 3 hours long', () => {
    const { sql, params } = render();
    expect(sql).toContain(`"bookings"."payment_deadline" > now()`);
    expect(sql).toContain(`"bookings"."payment_deadline" <= now() + interval '150 minutes'`);
    expect(sql).toContain(
      `"bookings"."payment_deadline" - "bookings"."created_at" >= interval '3 hours'`,
    );
    // Intervals are inlined, so nothing reaches the driver as a parameter.
    expect(params).toEqual([]);
  });
});
