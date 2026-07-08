import { and, eq, gte, lt, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import {
  analyticsEvents,
  bookings,
  experiences,
  guests,
  hosts,
  paymentEvents,
  payouts,
  reviews,
  savedExperiences,
} from '@/db/schema';
import {
  comparison,
  enumerateBuckets,
  granularityFor,
  toInstantBounds,
  type DateRange,
} from '@/features/admin/dashboard/lib/date-range';
import type {
  CategorySlice,
  DashboardMetrics,
  DeclineLeaderRow,
  Delta,
  FailureSlice,
  LeaderRow,
  PaymentSlice,
  QuerySlice,
  RatingSlice,
  SeriesPoint,
  SourceSlice,
  ZeroBookingListing,
} from '@/features/admin/dashboard/metrics-types';
import { adminGuard } from '@/features/admin/guard';

/**
 * Range-filtered dashboard metrics. Aggregation lives in SQL and is squeezed
 * into **13 round-trips** (down from one-per-metric): a single bookings⋈
 * experiences scan computes every booking-derived figure for the selected AND
 * previous window via `FILTER`; a second statement folds every other-table
 * single-row metric into scalar subqueries; the rest are the genuine GROUP BY
 * breakdowns (time series, category, payment mix, two leaderboards, rating
 * distribution, settle-failure reasons, decline leaders, zero-booking list,
 * zero-result searches, bookings by acquisition source).
 * Keeping the fan-out small keeps the dashboard fast and the connection pool
 * unsaturated. Bookings window by `created_at`; refunds by `refunded_at`;
 * utilization seats by the experience `date` itself.
 */

interface Window {
  start: Date;
  endExclusive: Date;
}

const REVENUE = sql`${bookings.status} in ('confirmed','completed')`;

/**
 * A Date bound as a casted timestamptz literal. postgres-js (prepare:false)
 * cannot serialize a raw JS `Date` interpolated into a `sql` template — it
 * throws "Received an instance of Date". Drizzle's `gte/lt` helpers serialize
 * Dates correctly; for hand-written FILTER clauses we pass the ISO string and
 * cast it back, which Postgres parses cleanly.
 */
function iso(d: Date): SQL {
  return sql`${d.toISOString()}::timestamptz`;
}

/** `col ∈ [w.start, w.endExclusive)` as a FILTER-clause predicate. */
function inWindow(col: AnyColumn, w: Window): SQL {
  return sql`${col} >= ${iso(w.start)} and ${col} < ${iso(w.endExclusive)}`;
}

/** `created_at ∈ [w.start, w.endExclusive)` */
function created(w: Window): SQL {
  return inWindow(bookings.createdAt, w);
}

/** count(*) over rows matching `cond` and placed in window `w`. */
function cnt(cond: SQL, w: Window): SQL<number> {
  return sql<number>`count(*) filter (where (${cond}) and ${created(w)})::int`;
}

/** sum(total_amount) over rows matching `cond` and placed in window `w`. */
function sumAmt(cond: SQL, w: Window): SQL<number> {
  return sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where (${cond}) and ${created(w)}), 0)::int`;
}

/**
 * VAT portion contained in revenue bookings, from the per-booking rate
 * snapshot stamped at settlement (`total × rate / (10000 + rate)` — prices
 * are VAT-inclusive). Bookings settled while the platform VAT toggle was
 * off carry a NULL rate and contribute 0, so the KPI is truthfully zero
 * until ZATCA registration day and only counts post-registration money.
 */
function vatSum(w: Window): SQL<number> {
  return sql<number>`coalesce(round(sum(${bookings.totalAmount} * ${bookings.vatRateBps} / (10000.0 + ${bookings.vatRateBps})) filter (where ${REVENUE} and ${bookings.vatRateBps} is not null and ${created(w)})), 0)::int`;
}

function netRevenue(w: Window): SQL<number> {
  // Commission on the ex-VAT base (owner decision 2026-07-07): the VAT
  // portion belongs to ZATCA and is never platform revenue. NULL-rate
  // bookings (pre-registration) contribute their full total as the base.
  const netBase = sql`(${bookings.totalAmount} - coalesce(round(${bookings.totalAmount} * ${bookings.vatRateBps}::numeric / (10000 + ${bookings.vatRateBps})), 0))`;
  return sql<number>`coalesce(round(sum(${netBase} * ${bookings.commissionBps} / 10000.0) filter (where ${REVENUE} and ${created(w)})), 0)::int`;
}

function avgPartyX100(w: Window): SQL<number> {
  return sql<number>`coalesce(round(avg(${bookings.partySize}) filter (where ${REVENUE} and ${created(w)}) * 100), 0)::int`;
}

function avgRespX10(w: Window): SQL<number> {
  return sql<number>`coalesce(round(avg(extract(epoch from (${bookings.approvedAt} - ${bookings.createdAt})) / 3600.0) filter (where ${bookings.approvedAt} is not null and ${created(w)}) * 10), 0)::int`;
}

function refundedWindow(w: Window): SQL {
  return sql`coalesce(${bookings.refundedAt}, ${bookings.createdAt}) >= ${iso(w.start)} and coalesce(${bookings.refundedAt}, ${bookings.createdAt}) < ${iso(w.endExclusive)}`;
}

function refundedSum(w: Window): SQL<number> {
  return sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} = 'refunded' and ${refundedWindow(w)}), 0)::int`;
}

function refundedCnt(w: Window): SQL<number> {
  return sql<number>`count(*) filter (where ${bookings.status} = 'refunded' and ${refundedWindow(w)})::int`;
}

/** distinct revenue-guest count in window `w`. */
function retActive(w: Window): SQL<number> {
  return sql<number>`count(distinct ${bookings.guestId}) filter (where ${REVENUE} and ${created(w)})::int`;
}

/** distinct revenue-guests in window `w` who had ANY booking before `w` started. */
function retReturning(w: Window): SQL<number> {
  return sql<number>`count(distinct ${bookings.guestId}) filter (where ${REVENUE} and ${created(w)} and ${bookings.guestId} in (select ${bookings.guestId} from ${bookings} where ${bookings.createdAt} < ${iso(w.start)}))::int`;
}

/** count of revenue bookings on instant-confirm experiences in window `w`. */
function instantCount(w: Window): SQL<number> {
  return sql<number>`count(*) filter (where ${experiences.bookingMode} = 'instant' and ${REVENUE} and ${created(w)})::int`;
}

/** distinct hosts with a revenue booking in window `w`. */
function activeHostCount(w: Window): SQL<number> {
  return sql<number>`count(distinct ${experiences.hostId}) filter (where ${REVENUE} and ${created(w)})::int`;
}

const STATUS = (s: string): SQL => sql`${bookings.status} = ${s}`;

/** `bookings.date ∈ [r.from, r.to]` — the experience day, not creation time. */
function onDay(r: DateRange): SQL {
  return sql`${bookings.date} >= ${r.from}::date and ${bookings.date} <= ${r.to}::date`;
}

/** Seats sold: sum(party_size) over revenue bookings whose experience day is in `r`. */
function seatsBooked(r: DateRange): SQL<number> {
  return sql<number>`coalesce(sum(${bookings.partySize}) filter (where ${REVENUE} and ${onDay(r)}), 0)::int`;
}

/** Avg days between creation (Riyadh-local day) and the experience day, ×10. */
function leadDaysX10(w: Window): SQL<number> {
  return sql<number>`coalesce(round(avg(${bookings.date} - (${bookings.createdAt} at time zone 'Asia/Riyadh')::date) filter (where ${REVENUE} and ${created(w)}) * 10), 0)::int`;
}

/**
 * Host response SLA (24h, BRIEF/host policy) over request-to-book bookings
 * created in `w`. Only decided requests count: approvals carry `approved_at`,
 * declines `declined_at` (2026-07-08 column; older declines have NULL and are
 * skipped), never-answered requests end `expired`.
 */
function slaDecided(w: Window): SQL<number> {
  return sql<number>`count(*) filter (where ${experiences.bookingMode} = 'request' and (${bookings.approvedAt} is not null or ${bookings.declinedAt} is not null or ${bookings.status} = 'expired') and ${created(w)})::int`;
}

function slaBreached(w: Window): SQL<number> {
  return sql<number>`count(*) filter (where ${experiences.bookingMode} = 'request' and (${bookings.status} = 'expired' or coalesce(${bookings.approvedAt}, ${bookings.declinedAt}) - ${bookings.createdAt} > interval '24 hours') and ${created(w)})::int`;
}

/** Percent (0–100, rounded), guarding divide-by-zero. */
function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function getDashboardMetrics(range: DateRange): Promise<DashboardMetrics | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    return await runDashboardMetrics(range);
  } catch (error) {
    reportError(error, { surface: 'admin:getDashboardMetrics' });
    return null;
  }
}

/**
 * The unguarded aggregation. Throws on any DB error (the caller logs + degrades
 * to null). Separated from the guard so it can be exercised directly in tests.
 */
async function runDashboardMetrics(range: DateRange): Promise<DashboardMetrics> {
  const prevRange = comparison(range);
  const cur = toInstantBounds(range);
  const prev = toInstantBounds(prevRange);
  const granularity = granularityFor(range);

  // Scalar-subquery predicates for the single other-table statement.
  const win = (col: AnyColumn, w: Window) => inWindow(col, w);

  const [
    scanRow,
    otherRows,
    seriesRows,
    categoryRows,
    paymentRows,
    topExpRows,
    topHostRows,
    ratingRows,
    failureRows,
    declineRows,
    zeroRows,
    zeroQueryRows,
    sourceRows,
  ] = await Promise.all([
    // (1) One bookings⋈experiences scan → every booking/experience-derived
    // single-row metric, both windows. The inner join is 1:1 (FK), so the
    // booking aggregates are unaffected by it.
    db
      .select({
        reqCur: cnt(sql`true`, cur),
        reqPrev: cnt(sql`true`, prev),
        revCur: cnt(REVENUE, cur),
        revPrev: cnt(REVENUE, prev),
        gmvCur: sumAmt(REVENUE, cur),
        gmvPrev: sumAmt(REVENUE, prev),
        netCur: netRevenue(cur),
        netPrev: netRevenue(prev),
        confirmedCur: cnt(STATUS('confirmed'), cur),
        completedCur: cnt(STATUS('completed'), cur),
        completedPrev: cnt(STATUS('completed'), prev),
        pendingCur: cnt(STATUS('pending'), cur),
        declinedCur: cnt(STATUS('declined'), cur),
        expiredCur: cnt(STATUS('expired'), cur),
        cancelledCur: cnt(STATUS('cancelled'), cur),
        avgPartyCur: avgPartyX100(cur),
        avgPartyPrev: avgPartyX100(prev),
        avgRespCur: avgRespX10(cur),
        avgRespPrev: avgRespX10(prev),
        refundedSarCur: refundedSum(cur),
        refundedSarPrev: refundedSum(prev),
        vatSarCur: vatSum(cur),
        vatSarPrev: vatSum(prev),
        refundedCntCur: refundedCnt(cur),
        instantCur: instantCount(cur),
        instantPrev: instantCount(prev),
        activeHostsCur: activeHostCount(cur),
        activeHostsPrev: activeHostCount(prev),
        retActiveCur: retActive(cur),
        retActivePrev: retActive(prev),
        retReturningCur: retReturning(cur),
        retReturningPrev: retReturning(prev),
        seatsBookedCur: seatsBooked(range),
        seatsBookedPrev: seatsBooked(prevRange),
        leadCur: leadDaysX10(cur),
        leadPrev: leadDaysX10(prev),
        slaDecidedCur: slaDecided(cur),
        slaDecidedPrev: slaDecided(prev),
        slaBreachedCur: slaBreached(cur),
        slaBreachedPrev: slaBreached(prev),
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId)),

    // (2) Every other-table single-row metric in one statement via scalar
    // subqueries — one round-trip instead of seven.
    db.execute(sql`select
        (select count(*) from ${guests} where ${win(guests.createdAt, cur)})::int as new_guests_cur,
        (select count(*) from ${guests} where ${win(guests.createdAt, prev)})::int as new_guests_prev,
        (select count(*) from ${guests} where ${guests.preferredLanguage} = 'ar' and ${win(guests.createdAt, cur)})::int as ar_cur,
        (select count(*) from ${savedExperiences} where ${win(savedExperiences.createdAt, cur)})::int as saves_cur,
        (select count(*) from ${savedExperiences} where ${win(savedExperiences.createdAt, prev)})::int as saves_prev,
        (select count(*) from ${hosts} where ${win(hosts.createdAt, cur)})::int as new_hosts_cur,
        (select count(*) from ${hosts} where ${win(hosts.createdAt, prev)})::int as new_hosts_prev,
        (select count(*) from ${hosts} where ${hosts.verificationStatus} = 'verified')::int as verified,
        (select count(*) from ${hosts} where ${hosts.verificationStatus} = 'pending')::int as host_pending,
        (select count(*) from ${hosts} where ${hosts.verificationStatus} = 'suspended')::int as suspended,
        (select coalesce(sum(${payouts.amountSar}), 0) from ${payouts} where ${win(payouts.createdAt, cur)})::int as payouts_cur,
        (select coalesce(sum(${payouts.amountSar}), 0) from ${payouts} where ${win(payouts.createdAt, prev)})::int as payouts_prev,
        (select count(*) from ${paymentEvents} where ${paymentEvents.type} = 'settle_succeeded' and ${win(paymentEvents.createdAt, cur)})::int as pe_ok_cur,
        (select count(*) from ${paymentEvents} where ${paymentEvents.type} = 'settle_failed' and ${win(paymentEvents.createdAt, cur)})::int as pe_fail_cur,
        (select count(*) from ${paymentEvents} where ${paymentEvents.type} = 'settle_succeeded' and ${win(paymentEvents.createdAt, prev)})::int as pe_ok_prev,
        (select count(*) from ${paymentEvents} where ${paymentEvents.type} = 'settle_failed' and ${win(paymentEvents.createdAt, prev)})::int as pe_fail_prev,
        (select count(*) from ${reviews} where ${reviews.hiddenAt} is null and ${win(reviews.createdAt, cur)})::int as rev_cnt_cur,
        (select count(*) from ${reviews} where ${reviews.hiddenAt} is null and ${win(reviews.createdAt, prev)})::int as rev_cnt_prev,
        (select coalesce(round(avg(${reviews.rating}) * 10), 0) from ${reviews} where ${reviews.hiddenAt} is null and ${win(reviews.createdAt, cur)})::int as rev_avg_cur,
        (select coalesce(round(avg(${reviews.rating}) * 10), 0) from ${reviews} where ${reviews.hiddenAt} is null and ${win(reviews.createdAt, prev)})::int as rev_avg_prev,
        (select count(*) from ${reviews} where ${reviews.hiddenAt} is not null)::int as rev_hidden,
        (select count(*) filter (where ${experiences.status} = 'draft') from ${experiences})::int as exp_draft,
        (select count(*) filter (where ${experiences.status} = 'pending_review') from ${experiences})::int as exp_pending,
        (select count(*) filter (where ${experiences.status} = 'changes_requested') from ${experiences})::int as exp_changes,
        (select count(*) filter (where ${experiences.status} = 'live') from ${experiences})::int as exp_live,
        (select count(*) filter (where ${experiences.status} = 'paused') from ${experiences})::int as exp_paused,
        (select count(*) filter (where ${experiences.status} = 'archived') from ${experiences})::int as exp_archived,
        (select count(*) filter (where ${experiences.status} = 'live' and ${experiences.featured}) from ${experiences})::int as exp_originals,
        (select count(distinct ${paymentEvents.bookingId}) from ${paymentEvents} where ${paymentEvents.type} = 'checkout_created' and ${win(paymentEvents.createdAt, cur)})::int as co_init_cur,
        (select count(distinct ${paymentEvents.bookingId}) from ${paymentEvents} where ${paymentEvents.type} = 'checkout_created' and ${win(paymentEvents.createdAt, prev)})::int as co_init_prev,
        (select count(distinct pe.booking_id) from payment_events pe where pe.type = 'checkout_created' and pe.created_at >= ${iso(cur.start)} and pe.created_at < ${iso(cur.endExclusive)} and exists (select 1 from payment_events s where s.booking_id = pe.booking_id and s.type = 'settle_succeeded'))::int as co_settled_cur,
        (select count(distinct pe.booking_id) from payment_events pe where pe.type = 'checkout_created' and pe.created_at >= ${iso(prev.start)} and pe.created_at < ${iso(prev.endExclusive)} and exists (select 1 from payment_events s where s.booking_id = pe.booking_id and s.type = 'settle_succeeded'))::int as co_settled_prev,
        (select coalesce(sum(e.max_group_size * d.n), 0) from experiences e cross join lateral (select count(*) as n from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') g(day) where extract(dow from g.day)::int = any(e.availability_weekdays) and not (g.day::date = any(e.blackout_dates))) d where e.status = 'live')::int as offered_cur,
        (select coalesce(sum(e.max_group_size * d.n), 0) from experiences e cross join lateral (select count(*) as n from generate_series(${prevRange.from}::date, ${prevRange.to}::date, interval '1 day') g(day) where extract(dow from g.day)::int = any(e.availability_weekdays) and not (g.day::date = any(e.blackout_dates))) d where e.status = 'live')::int as offered_prev,
        (select count(*) from experiences e where e.status = 'live' and not exists (select 1 from bookings b where b.experience_id = e.id and b.status in ('confirmed','completed') and b.created_at >= ${iso(cur.start)} and b.created_at < ${iso(cur.endExclusive)}))::int as zero_live,
        (select count(*) from ${analyticsEvents} where ${analyticsEvents.type} = 'experience_view' and ${win(analyticsEvents.createdAt, cur)})::int as views_cur,
        (select count(*) from ${analyticsEvents} where ${analyticsEvents.type} = 'experience_view' and ${win(analyticsEvents.createdAt, prev)})::int as views_prev,
        (select count(*) from ${analyticsEvents} where ${analyticsEvents.type} = 'search' and ${analyticsEvents.resultCount} = 0 and ${win(analyticsEvents.createdAt, cur)})::int as zsearch_cur,
        (select count(*) from ${analyticsEvents} where ${analyticsEvents.type} = 'search' and ${analyticsEvents.resultCount} = 0 and ${win(analyticsEvents.createdAt, prev)})::int as zsearch_prev
      `),

    // (3) Time series over the selected window, bucketed in Riyadh time.
    db
      .select({
        bucket: sql<string>`to_char(date_trunc(${granularity}, ${bookings.createdAt} at time zone 'Asia/Riyadh'), 'YYYY-MM-DD')`,
        bookings: sql<number>`count(*) filter (where ${REVENUE})::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${REVENUE}), 0)::int`,
      })
      .from(bookings)
      .where(and(gte(bookings.createdAt, cur.start), lt(bookings.createdAt, cur.endExclusive)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    // (4) GMV by category.
    db
      .select({
        category: experiences.category,
        bookings: sql<number>`count(*)::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(
        and(
          sql`${bookings.status} in ('confirmed','completed')`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(experiences.category),

    // (5) Payment-method mix.
    db
      .select({
        brand: sql<string>`coalesce(nullif(${bookings.paymentBrand}, ''), 'unknown')`,
        bookings: sql<number>`count(*)::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .where(
        and(
          sql`${bookings.status} in ('confirmed','completed')`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(sql`1`),

    // (6) Top experiences by GMV.
    db
      .select({
        id: experiences.id,
        label: experiences.titleEn,
        slug: experiences.slug,
        bookings: sql<number>`count(*)::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(
        and(
          sql`${bookings.status} in ('confirmed','completed')`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(experiences.id, experiences.titleEn, experiences.slug)
      .orderBy(sql`coalesce(sum(${bookings.totalAmount}), 0) desc`)
      .limit(5),

    // (7) Top hosts by GMV.
    db
      .select({
        id: hosts.id,
        label: hosts.name,
        bookings: sql<number>`count(*)::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .where(
        and(
          sql`${bookings.status} in ('confirmed','completed')`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(hosts.id, hosts.name)
      .orderBy(sql`coalesce(sum(${bookings.totalAmount}), 0) desc`)
      .limit(5),

    // (8) Rating distribution over visible reviews in the window.
    db
      .select({ rating: reviews.rating, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(
        and(
          sql`${reviews.hiddenAt} is null`,
          gte(reviews.createdAt, cur.start),
          lt(reviews.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(reviews.rating),

    // (9) Failed settles by gateway result code. The card brand on a
    // failed attempt isn't reliably recorded (bookings.payment_brand
    // holds the latest attempt only), so the exact OPPWA code is the
    // truthful axis for "why are payments failing".
    db
      .select({
        resultCode: sql<string>`coalesce(nullif(${paymentEvents.resultCode}, ''), 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(paymentEvents)
      .where(
        and(
          sql`${paymentEvents.type} = 'settle_failed'`,
          gte(paymentEvents.createdAt, cur.start),
          lt(paymentEvents.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`count(*) desc`)
      .limit(6),

    // (10) Hosts declining the most requests. ≥3 requests so one decline
    // on a single request doesn't top the list; only hosts with at least
    // one decline appear at all.
    db
      .select({
        id: hosts.id,
        label: hosts.name,
        requests: sql<number>`count(*)::int`,
        declined: sql<number>`count(*) filter (where ${bookings.status} = 'declined')::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .innerJoin(hosts, eq(hosts.id, experiences.hostId))
      .where(
        and(
          sql`${experiences.bookingMode} = 'request'`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(hosts.id, hosts.name)
      .having(sql`count(*) >= 3 and count(*) filter (where ${bookings.status} = 'declined') > 0`)
      .orderBy(
        sql`(count(*) filter (where ${bookings.status} = 'declined'))::numeric / count(*) desc`,
      )
      .limit(5),

    // (11) Live listings with no revenue booking created in the window,
    // oldest first — the ones that have had the longest chance to sell.
    db
      .select({
        id: experiences.id,
        label: experiences.titleEn,
        slug: experiences.slug,
        createdAt: experiences.createdAt,
      })
      .from(experiences)
      .where(
        and(
          eq(experiences.status, 'live'),
          sql`not exists (select 1 from ${bookings} where ${bookings.experienceId} = ${experiences.id} and ${bookings.status} in ('confirmed','completed') and ${created(cur)})`,
        ),
      )
      .orderBy(experiences.createdAt)
      .limit(5),

    // (12) Most-repeated zero-result searches — demand we couldn't serve,
    // i.e. the supply-recruitment shortlist.
    db
      .select({
        query: sql<string>`coalesce(nullif(${analyticsEvents.searchQuery}, ''), 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.type} = 'search'`,
          sql`${analyticsEvents.resultCount} = 0`,
          gte(analyticsEvents.createdAt, cur.start),
          lt(analyticsEvents.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`count(*) desc`)
      .limit(6),

    // (13) Revenue bookings by first-touch acquisition source.
    db
      .select({
        source: sql<string>`coalesce(nullif(${bookings.utmSource}, ''), 'organic')`,
        bookings: sql<number>`count(*)::int`,
        gmvSar: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .where(
        and(
          sql`${bookings.status} in ('confirmed','completed')`,
          gte(bookings.createdAt, cur.start),
          lt(bookings.createdAt, cur.endExclusive),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`coalesce(sum(${bookings.totalAmount}), 0) desc`),
  ]);

  const s = scanRow[0];
  const o = otherRows[0];
  if (!s || !o) throw new Error('dashboard metrics: empty aggregate row');
  const n = (key: string): number => Number(o[key] ?? 0);

  const delta = (current: number, previous: number): Delta => ({ current, previous });

  const series: SeriesPoint[] = fillSeries(
    enumerateBuckets(range, granularity),
    seriesRows.map((r) => ({ bucket: r.bucket, bookings: r.bookings, gmvSar: r.gmvSar })),
  );

  const paymentMix: PaymentSlice[] = paymentRows
    .map((r) => ({ brand: r.brand, bookings: r.bookings, gmvSar: r.gmvSar }))
    .sort((a, b) => b.gmvSar - a.gmvSar);

  const gmvByCategory: CategorySlice[] = categoryRows
    .map((r) => ({ category: r.category, bookings: r.bookings, gmvSar: r.gmvSar }))
    .sort((a, b) => b.gmvSar - a.gmvSar);

  const topHosts: LeaderRow[] = topHostRows.map((r) => ({
    id: r.id,
    label: r.label,
    bookings: r.bookings,
    gmvSar: r.gmvSar,
  }));
  const topExperiences: LeaderRow[] = topExpRows.map((r) => ({
    id: r.id,
    label: r.label,
    href: `/experiences/${r.slug}`,
    bookings: r.bookings,
    gmvSar: r.gmvSar,
  }));

  const byRating = new Map(ratingRows.map((r) => [r.rating, r.count]));
  const ratingDistribution: RatingSlice[] = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: byRating.get(rating) ?? 0,
  }));

  const failureReasons: FailureSlice[] = failureRows.map((r) => ({
    resultCode: r.resultCode,
    count: r.count,
  }));

  const declineLeaders: DeclineLeaderRow[] = declineRows.map((r) => ({
    id: r.id,
    label: r.label,
    requests: r.requests,
    declined: r.declined,
    declinePct: pct(r.declined, r.requests),
  }));

  const zeroResultQueries: QuerySlice[] = zeroQueryRows.map((r) => ({
    query: r.query,
    count: r.count,
  }));

  const bookingsBySource: SourceSlice[] = sourceRows.map((r) => ({
    source: r.source,
    bookings: r.bookings,
    gmvSar: r.gmvSar,
  }));

  const now = Date.now();
  const zeroBookingListings: ZeroBookingListing[] = zeroRows.map((r) => ({
    id: r.id,
    label: r.label,
    href: `/experiences/${r.slug}`,
    daysLive: Math.max(0, Math.floor((now - r.createdAt.getTime()) / 86_400_000)),
  }));

  return {
    granularity,
    gmvSar: delta(s.gmvCur, s.gmvPrev),
    netRevenueSar: delta(s.netCur, s.netPrev),
    bookings: delta(s.revCur, s.revPrev),
    newGuests: delta(n('new_guests_cur'), n('new_guests_prev')),
    aovSar: delta(
      s.revCur > 0 ? Math.round(s.gmvCur / s.revCur) : 0,
      s.revPrev > 0 ? Math.round(s.gmvPrev / s.revPrev) : 0,
    ),
    confirmationRate: delta(pct(s.revCur, s.reqCur), pct(s.revPrev, s.reqPrev)),

    hostPayoutsSar: delta(n('payouts_cur'), n('payouts_prev')),
    refundedSar: delta(s.refundedSarCur, s.refundedSarPrev),
    vatSar: delta(s.vatSarCur, s.vatSarPrev),
    paymentSuccessRate: delta(
      pct(n('pe_ok_cur'), n('pe_ok_cur') + n('pe_fail_cur')),
      pct(n('pe_ok_prev'), n('pe_ok_prev') + n('pe_fail_prev')),
    ),
    paymentMix,

    funnel: {
      requests: s.reqCur,
      confirmed: s.confirmedCur,
      completed: s.completedCur,
      pending: s.pendingCur,
      declined: s.declinedCur,
      expired: s.expiredCur,
      cancelled: s.cancelledCur,
      refunded: s.refundedCntCur,
    },
    completionRate: delta(pct(s.completedCur, s.revCur), pct(s.completedPrev, s.revPrev)),
    avgPartySizeX100: delta(s.avgPartyCur, s.avgPartyPrev),
    instantShare: delta(pct(s.instantCur, s.revCur), pct(s.instantPrev, s.revPrev)),
    avgResponseHoursX10: delta(s.avgRespCur, s.avgRespPrev),

    returningGuestRate: delta(
      pct(s.retReturningCur, s.retActiveCur),
      pct(s.retReturningPrev, s.retActivePrev),
    ),
    newGuestArShare: pct(n('ar_cur'), n('new_guests_cur')),
    wishlistSaves: delta(n('saves_cur'), n('saves_prev')),
    experienceViews: delta(n('views_cur'), n('views_prev')),
    viewToRequestPct: delta(pct(s.reqCur, n('views_cur')), pct(s.reqPrev, n('views_prev'))),
    zeroResultSearches: delta(n('zsearch_cur'), n('zsearch_prev')),
    zeroResultQueries,
    bookingsBySource,

    newHosts: delta(n('new_hosts_cur'), n('new_hosts_prev')),
    activeHosts: delta(s.activeHostsCur, s.activeHostsPrev),
    hostVerification: {
      verified: n('verified'),
      pending: n('host_pending'),
      suspended: n('suspended'),
    },
    topHosts,

    experienceStatus: {
      draft: n('exp_draft'),
      pendingReview: n('exp_pending'),
      changesRequested: n('exp_changes'),
      live: n('exp_live'),
      paused: n('exp_paused'),
      archived: n('exp_archived'),
    },
    originalsLive: n('exp_originals'),
    gmvByCategory,
    topExperiences,
    avgRatingX10: delta(n('rev_avg_cur'), n('rev_avg_prev')),
    reviewCount: delta(n('rev_cnt_cur'), n('rev_cnt_prev')),
    reviewedRate: delta(
      pct(n('rev_cnt_cur'), s.completedCur),
      pct(n('rev_cnt_prev'), s.completedPrev),
    ),
    hiddenReviews: n('rev_hidden'),

    utilizationPct: delta(
      pct(s.seatsBookedCur, n('offered_cur')),
      pct(s.seatsBookedPrev, n('offered_prev')),
    ),
    checkoutAbandonPct: delta(
      abandonPct(n('co_init_cur'), n('co_settled_cur')),
      abandonPct(n('co_init_prev'), n('co_settled_prev')),
    ),
    avgLeadDaysX10: delta(s.leadCur, s.leadPrev),
    slaBreachPct: delta(
      pct(s.slaBreachedCur, s.slaDecidedCur),
      pct(s.slaBreachedPrev, s.slaDecidedPrev),
    ),
    takeRatePctX10: delta(rateX10(s.netCur, s.gmvCur), rateX10(s.netPrev, s.gmvPrev)),
    zeroBookingLive: n('zero_live'),
    zeroBookingListings,
    ratingDistribution,
    failureReasons,
    declineLeaders,

    series,
  };
}

/**
 * Percent of opened checkouts that never settled. Distinct from a simple
 * `100 - pct(settled, initiated)`: an empty window must read 0, not 100.
 */
function abandonPct(initiated: number, settled: number): number {
  if (initiated <= 0) return 0;
  return Math.max(0, Math.round(((initiated - settled) / initiated) * 100));
}

/** `numerator ÷ denominator` as a percent ×10 (one decimal for the UI). */
function rateX10(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000);
}

/** Zero-fill the series so the chart has a bar for every bucket in the span. */
function fillSeries(buckets: readonly string[], rows: readonly SeriesPoint[]): SeriesPoint[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  return buckets.map((bucket) => byBucket.get(bucket) ?? { bucket, bookings: 0, gmvSar: 0 });
}
