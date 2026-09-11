import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { bookings } from '@/db/schema';

/** The four columns the hold predicate reads — `bookings` or an alias of it. */
interface HoldColumns {
  paymentStatus: AnyPgColumn;
  paymentDeadline: AnyPgColumn;
  status: AnyPgColumn;
  approvalDeadline: AnyPgColumn;
}

/**
 * SQL condition: the booking still occupies its spot for capacity
 * purposes. Pairs with the `ACTIVE_BOOKING_STATUSES` status filter in
 * every capacity sum.
 *
 * A booking whose online-payment hold has lapsed (`unpaid` or `failed`
 * past its `paymentDeadline`) stops counting toward capacity even
 * before the release cron flips it to `cancelled` — otherwise abandoned
 * holds block real guests for up to a full cron interval, and a loop of
 * free, anonymous bookings could hold every seat indefinitely.
 * `processing` rows always count: a checkout exists, payment may be in
 * flight. Uses the database clock (`now()`) so all callers agree.
 *
 * The same applies to a `pending` request whose approval window has
 * lapsed (2026-08-02 ops audit): the cron will expire it, but until
 * that pass runs it must not block real guests from the date. This
 * predicate previously lived only in the phone-throttle query, so
 * every capacity sum over-counted by up to one cron interval.
 */
export function holdStillCounts(t: HoldColumns = bookings): SQL {
  return sql`not (${t.paymentStatus} in ('unpaid', 'failed') and ${t.paymentDeadline} is not null and ${t.paymentDeadline} <= now())
    and not (${t.status} = 'pending' and ${t.approvalDeadline} is not null and ${t.approvalDeadline} <= now())`;
}
