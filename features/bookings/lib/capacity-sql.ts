import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { bookings } from '@/db/schema';

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
 */
export function holdStillCounts(): SQL {
  return sql`not (${bookings.paymentStatus} in ('unpaid', 'failed') and ${bookings.paymentDeadline} is not null and ${bookings.paymentDeadline} <= now())`;
}
