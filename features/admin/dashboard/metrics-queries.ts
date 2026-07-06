import { and, eq, gte, lt, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import {
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
  Delta,
  LeaderRow,
  PaymentSlice,
  SeriesPoint,
} from '@/features/admin/dashboard/metrics-types';
import { adminGuard } from '@/features/admin/guard';

/**
 * Range-filtered dashboard metrics. Aggregation lives in SQL and is squeezed
 * into **7 round-trips** (down from one-per-metric): a single bookings⋈
 * experiences scan computes every booking-derived figure for the selected AND
 * previous window via `FILTER`; a second statement folds every other-table
 * single-row metric into scalar subqueries; the remaining five are the genuine
 * GROUP BY breakdowns (time series, category, payment mix, two leaderboards).
 * Keeping the fan-out small keeps the dashboard fast and the connection pool
 * unsaturated. Bookings window by `created_at`; refunds by `refunded_at`.
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

function netRevenue(w: Window): SQL<number> {
  return sql<number>`coalesce(round(sum(${bookings.totalAmount} * ${bookings.commissionBps} / 10000.0) filter (where ${REVENUE} and ${created(w)})), 0)::int`;
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
  const cur = toInstantBounds(range);
  const prev = toInstantBounds(comparison(range));
  const granularity = granularityFor(range);

  // Scalar-subquery predicates for the single other-table statement.
  const win = (col: AnyColumn, w: Window) => inWindow(col, w);

  const [scanRow, otherRows, seriesRows, categoryRows, paymentRows, topExpRows, topHostRows] =
    await Promise.all([
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
          refundedCntCur: refundedCnt(cur),
          instantCur: instantCount(cur),
          instantPrev: instantCount(prev),
          activeHostsCur: activeHostCount(cur),
          activeHostsPrev: activeHostCount(prev),
          retActiveCur: retActive(cur),
          retActivePrev: retActive(prev),
          retReturningCur: retReturning(cur),
          retReturningPrev: retReturning(prev),
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
        (select count(*) filter (where ${experiences.status} = 'live' and ${experiences.featured}) from ${experiences})::int as exp_originals
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
    vatSar: delta(Math.round((s.gmvCur * 15) / 115), Math.round((s.gmvPrev * 15) / 115)),
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

    series,
  };
}

/** Zero-fill the series so the chart has a bar for every bucket in the span. */
function fillSeries(buckets: readonly string[], rows: readonly SeriesPoint[]): SeriesPoint[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  return buckets.map((bucket) => byBucket.get(bucket) ?? { bucket, bookings: 0, gmvSar: 0 });
}
