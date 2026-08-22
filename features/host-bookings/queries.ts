import { asc, desc, eq, gte, lte, ilike, inArray, and, not, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentHostId } from '@/features/host-dashboard/queries';
import { splitCommission } from '@/features/bookings/lib/commission';
import {
  ACTIVE_BOOKING_STATUSES,
  nowMinutesInRiyadh,
  startWindowClosed,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import type {
  HostBookingDetail,
  HostBookingRow,
  HostCalendarDay,
  HostComingUpRow,
} from '@/features/host-bookings/types';

/**
 * Host-scoped reads over bookings. Every helper resolves the caller's
 * `hosts.id` from the request-memoised resolver (features/host-dashboard),
 * so a host can never see another host's bookings — the WHERE clause is
 * `experiences.hostId = myHostId`, not anything the client supplies.
 * Reads are status-blind: a suspended host still sees their own bookings
 * (the actions layer is what refuses their writes).
 *
 * PII note: the guest's phone is included only once a booking is
 * confirmed/completed (the host needs it to coordinate the day);
 * pending requests carry the name and the guest's note only.
 */

/** Requests / upcoming caps — either bucket outgrowing this is a support case. */
const OPEN_BUCKET_LIMIT = 200;

/** Past bookings per page. */
export const PAST_PAGE_SIZE = 20;

/** Statuses where the host legitimately needs the guest's contact. */
const CONTACT_VISIBLE_STATUSES: readonly HostBookingRow['status'][] = ['confirmed', 'completed'];

export interface HostBookingsFilter {
  /** Case-insensitive match on guest name or booking reference code. */
  q?: string;
  /** Restrict to one experience (UUID — ignored if malformed). */
  experienceId?: string;
  /** Restrict to one date (`YYYY-MM-DD`) — the calendar's day drill-down. */
  date?: string;
  /** Zero-based page of the past section. */
  pastPage?: number;
}

export interface HostBookingsResult {
  /** Pending requests, oldest-first (answer in order received). */
  requests: readonly HostBookingRow[];
  /** Confirmed and today-or-later, soonest-first. */
  upcoming: readonly HostBookingRow[];
  /** Everything else, newest-first — the paginated tail. */
  past: readonly HostBookingRow[];
  pastTotal: number;
  pastPage: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Seats already held by OTHER active bookings on the same experience +
 * date — the number the host needs before accepting a request (2026-08-22
 * audit P1-3). Same status set + hold predicate as the capacity re-sum in
 * the transition executor, so "3 of 8 taken" on the card and the
 * `over_capacity` refusal can't disagree.
 */
function seatsTakenByOthersExpr(): SQL<number> {
  const other = alias(bookings, 'other');
  return sql<number>`coalesce((
    select sum(${other.partySize})::int from ${bookings} as ${other}
    where ${other.experienceId} = ${bookings.experienceId}
      and ${other.date} = ${bookings.date}
      and ${other.id} <> ${bookings.id}
      and ${other.status} in (${sql.join(
        ACTIVE_BOOKING_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
      and ${sql.raw(holdStillCountsFor('other'))}
  ), 0)`;
}

/**
 * `holdStillCounts()` is written against the `bookings` table; the
 * correlated subquery above needs it against the alias. Render the same
 * predicate for an aliased table name.
 */
function holdStillCountsFor(tableAlias: string): string {
  return `not ("${tableAlias}".payment_status in ('unpaid', 'failed') and "${tableAlias}".payment_deadline is not null and "${tableAlias}".payment_deadline <= now())
    and not ("${tableAlias}".status = 'pending' and "${tableAlias}".approval_deadline is not null and "${tableAlias}".approval_deadline <= now())`;
}

interface JoinedRow {
  booking: typeof bookings.$inferSelect;
  experienceSlug: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  maxGroupSize: number;
  bookingCutoffHours: number;
  guestName: string;
  guestPhone: string | null;
  seatsTakenByOthers: number;
}

function toRow(row: JoinedRow): HostBookingRow {
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    row.booking.totalAmount,
    row.booking.commissionBps,
    row.booking.vatRateBps,
    row.booking.discountSar,
    row.booking.walletAppliedSar,
  );
  const contactVisible = CONTACT_VISIBLE_STATUSES.includes(row.booking.status);

  // Same clock the executor asserts on approval (`too_late`): tell the
  // host BEFORE the click whether this request can still be accepted.
  const clock = {
    dateStr: row.booking.date,
    todayStr: todayInRiyadh(),
    startTime: row.booking.startTime,
    nowMinutes: nowMinutesInRiyadh(),
  };
  const started = startWindowClosed(clock);
  const insideCutoff = startWindowClosed({
    ...clock,
    cutoffMinutes: row.bookingCutoffHours * 60,
  });

  return {
    id: row.booking.id,
    referenceCode: row.booking.referenceCode,
    status: row.booking.status,
    paymentStatus: row.booking.paymentStatus,
    date: row.booking.date,
    startTime: row.booking.startTime,
    partySize: row.booking.partySize,
    totalAmountSar: row.booking.totalAmount,
    payoutSar,
    createdAt: row.booking.createdAt.toISOString(),
    approvalDeadline: row.booking.approvalDeadline?.toISOString() ?? null,
    paymentDeadline: row.booking.paymentDeadline?.toISOString() ?? null,
    experienceId: row.booking.experienceId,
    experienceSlug: row.experienceSlug,
    experienceTitleEn: row.experienceTitleEn,
    experienceTitleAr: row.experienceTitleAr,
    maxGroupSize: row.maxGroupSize,
    seatsTakenByOthers: row.seatsTakenByOthers,
    approvalClosed: started ? 'started' : insideCutoff ? 'cutoff' : null,
    guestName: row.guestName,
    guestPhone: contactVisible ? row.guestPhone : null,
    guestNote: row.booking.guestNote,
    cancellationKind: row.booking.cancellationKind,
  };
}

const selection = {
  booking: bookings,
  experienceSlug: experiences.slug,
  experienceTitleEn: experiences.titleEn,
  experienceTitleAr: experiences.titleAr,
  maxGroupSize: experiences.maxGroupSize,
  bookingCutoffHours: experiences.bookingCutoffHours,
  guestName: guests.name,
  guestPhone: sql<string | null>`coalesce(${bookings.contactPhone}, ${guests.phone})`,
};

function fromJoined() {
  return db
    .select({ ...selection, seatsTakenByOthers: seatsTakenByOthersExpr() })
    .from(bookings)
    .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
    .innerJoin(guests, eq(bookings.guestId, guests.id));
}

/**
 * The host bookings surface in one round of queries: three status
 * buckets (requests / upcoming / past) bucketed and ordered in SQL, the
 * past tail paginated. Filters compose onto every bucket so a search
 * narrows the whole page, not one section.
 */
export async function listBookingsForHost(
  filter: HostBookingsFilter = {},
): Promise<HostBookingsResult> {
  const empty: HostBookingsResult = {
    requests: [],
    upcoming: [],
    past: [],
    pastTotal: 0,
    pastPage: 0,
  };
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return empty;

  const todayRiyadh = todayInRiyadh();
  const pastPage = Math.max(0, Math.trunc(filter.pastPage ?? 0));

  const conditions: SQL[] = [eq(experiences.hostId, hostId)];
  const q = filter.q?.trim().slice(0, 80);
  if (q) {
    // Escape LIKE wildcards so a literal `%` in the box can't scan-match.
    const needle = `%${q.replace(/[\\%_]/g, String.raw`\$&`)}%`;
    const match = or(ilike(guests.name, needle), ilike(bookings.referenceCode, needle));
    if (match) conditions.push(match);
  }
  if (filter.experienceId && UUID_RE.test(filter.experienceId)) {
    conditions.push(eq(bookings.experienceId, filter.experienceId));
  }
  if (filter.date && DATE_RE.test(filter.date)) {
    conditions.push(eq(bookings.date, filter.date));
  }
  const base = and(...conditions);

  const isUpcoming = and(eq(bookings.status, 'confirmed'), gte(bookings.date, todayRiyadh));
  const isPast = not(or(eq(bookings.status, 'pending'), isUpcoming)!);

  try {
    const [requests, upcoming, past, [pastCount]] = await Promise.all([
      fromJoined()
        .where(and(base, eq(bookings.status, 'pending')))
        .orderBy(asc(bookings.createdAt))
        .limit(OPEN_BUCKET_LIMIT),
      fromJoined()
        .where(and(base, isUpcoming))
        .orderBy(asc(bookings.date), asc(bookings.startTime))
        .limit(OPEN_BUCKET_LIMIT),
      fromJoined()
        .where(and(base, isPast))
        .orderBy(desc(bookings.date), desc(bookings.createdAt))
        .limit(PAST_PAGE_SIZE)
        .offset(pastPage * PAST_PAGE_SIZE),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .innerJoin(guests, eq(bookings.guestId, guests.id))
        .where(and(base, isPast)),
    ]);

    return {
      requests: requests.map(toRow),
      upcoming: upcoming.map(toRow),
      past: past.map(toRow),
      pastTotal: pastCount?.count ?? 0,
      pastPage,
    };
  } catch (error) {
    // Rethrow: rendering the friendly "no bookings" empty state on a DB
    // error told hosts nothing was scheduled during outages. The route's
    // error boundary owns failures.
    reportError(error, { surface: 'host-bookings:list' });
    throw error;
  }
}

/**
 * One booking, by its human reference, only if it belongs to the current
 * host — the detail page. Foreign/missing references answer `null`
 * (never "exists but not yours"). Carries the full lifecycle timeline
 * the list row has no room for.
 */
export async function getBookingForHost(referenceCode: string): Promise<HostBookingDetail | null> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return null;
  const ref = referenceCode.trim().toUpperCase().slice(0, 20);
  if (!/^GH-[A-Z0-9]{4,12}$/.test(ref)) return null;
  try {
    const [row] = await fromJoined()
      .where(and(eq(experiences.hostId, hostId), eq(bookings.referenceCode, ref)))
      .limit(1);
    if (!row) return null;
    const b = row.booking;
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
      ...toRow(row),
      policyTier: b.policyTier,
      paymentBrand: b.paymentBrand,
      approvedAt: iso(b.approvedAt),
      declinedAt: iso(b.declinedAt),
      paidAt: iso(b.paidAt),
      cancelledAt: iso(b.cancelledAt),
      refundedAt: iso(b.refundedAt),
      reminderSentAt: iso(b.reminderSentAt),
      finalReminderSentAt: iso(b.finalReminderSentAt),
      hostPaidAt: iso(b.hostPaidAt),
      cancellationReason: b.cancellationReason,
      refundedAmountSar: b.refundedAmountSar,
      rescheduledFromDate: b.rescheduledFromDate,
      rescheduleCount: b.rescheduleCount,
      termsAcceptedAt: iso(b.termsAcceptedAt),
      womenOnlyAttestedAt: iso(b.womenOnlyAttestedAt),
      minAgeAttestedAt: iso(b.minAgeAttestedAt),
    };
  } catch (error) {
    reportError(error, { surface: 'host-bookings:detail', referenceCode: ref });
    throw error;
  }
}

/**
 * The open requests, oldest-first — the Today page's attention card
 * (the full list page has its own bucketed query).
 */
export async function listPendingRequestsForHost(
  limit: number,
): Promise<readonly HostBookingRow[]> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return [];
  try {
    const rows = await fromJoined()
      .where(and(eq(experiences.hostId, hostId), eq(bookings.status, 'pending')))
      .orderBy(asc(bookings.createdAt))
      .limit(limit);
    return rows.map(toRow);
  } catch (error) {
    reportError(error, { surface: 'host-bookings:pendingRequests' });
    return [];
  }
}

/**
 * Accepted requests whose guest hasn't paid yet and whose payment window
 * is still open — "held, not yet money" for the attention card.
 */
export async function listAwaitingPaymentForHost(
  limit: number,
): Promise<readonly HostBookingRow[]> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return [];
  try {
    const rows = await fromJoined()
      .where(
        and(
          eq(experiences.hostId, hostId),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.paymentStatus} <> 'paid'`,
          sql`${bookings.paymentDeadline} > now()`,
        ),
      )
      .orderBy(asc(bookings.paymentDeadline))
      .limit(limit);
    return rows.map(toRow);
  } catch (error) {
    reportError(error, { surface: 'host-bookings:awaitingPayment' });
    return [];
  }
}

/**
 * Bookings that occupy the calendar over the next `days` days (today
 * inclusive, Riyadh), soonest-first — the Today page's "Coming up"
 * strip. Confirmed only (a pending request isn't on the calendar yet;
 * it's in "Needs your attention"). Carries seats taken on the date so
 * the host sees "5 of 8" per session.
 */
export async function listComingUpForHost(days: number): Promise<readonly HostComingUpRow[]> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return [];
  const today = todayInRiyadh();
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + Math.max(0, days - 1));
  const endStr = end.toISOString().slice(0, 10);
  try {
    const rows = await db
      .select({
        id: bookings.id,
        referenceCode: bookings.referenceCode,
        date: bookings.date,
        startTime: bookings.startTime,
        partySize: bookings.partySize,
        paymentStatus: bookings.paymentStatus,
        paymentDeadline: bookings.paymentDeadline,
        guestName: guests.name,
        experienceId: experiences.id,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
        maxGroupSize: experiences.maxGroupSize,
        seatsTakenByOthers: seatsTakenByOthersExpr(),
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(
        and(
          eq(experiences.hostId, hostId),
          eq(bookings.status, 'confirmed'),
          gte(bookings.date, today),
          lte(bookings.date, endStr),
        ),
      )
      .orderBy(asc(bookings.date), asc(bookings.startTime), asc(bookings.createdAt))
      .limit(OPEN_BUCKET_LIMIT);
    return rows.map((r) => ({
      ...r,
      paymentDeadline: r.paymentDeadline?.toISOString() ?? null,
    }));
  } catch (error) {
    reportError(error, { surface: 'host-bookings:comingUp' });
    return [];
  }
}

/**
 * Per-day booking counts across one calendar month — the bookings
 * calendar view. Active bookings only (pending/confirmed/completed);
 * cancelled rows don't occupy a day.
 */
export async function listCalendarDaysForHost(month: string): Promise<readonly HostCalendarDay[]> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL || !/^\d{4}-\d{2}$/.test(month)) return [];
  const from = `${month}-01`;
  const next = new Date(`${from}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const to = next.toISOString().slice(0, 10);
  try {
    const rows = await db
      .select({
        date: bookings.date,
        bookings: sql<number>`count(*)::int`,
        guests: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int`,
        pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(
        and(
          eq(experiences.hostId, hostId),
          inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
          holdStillCounts(),
          gte(bookings.date, from),
          sql`${bookings.date} < ${to}`,
        ),
      )
      .groupBy(bookings.date)
      .orderBy(asc(bookings.date));
    return rows;
  } catch (error) {
    reportError(error, { surface: 'host-bookings:calendar', month });
    return [];
  }
}

/**
 * Count of pending (request-mode) bookings awaiting this host's
 * decision — the dashboard badge that pulls hosts into /host/bookings.
 */
export async function countPendingRequestsForHost(): Promise<number> {
  const hostId = await getCurrentHostId();
  if (!hostId || !serverEnv.DATABASE_URL) return 0;
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(and(eq(experiences.hostId, hostId), inArray(bookings.status, ['pending'])));
    return count;
  } catch (error) {
    reportError(error, { surface: 'host-bookings:countPending' });
    return 0;
  }
}
