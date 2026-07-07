import { asc, desc, eq, gte, ilike, inArray, and, not, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import { splitCommission } from '@/features/bookings/lib/commission';
import type { HostBookingRow } from '@/features/host-bookings/types';

/**
 * Host-scoped reads over bookings. Every helper resolves the caller's
 * `hosts.id` first (same chassis as features/host-experiences/queries),
 * so a host can never see another host's bookings — the WHERE clause is
 * `experiences.hostId = myHostId`, not anything the client supplies.
 *
 * PII note: the guest's phone is included only once a booking is
 * confirmed/completed (the host needs it to coordinate the day);
 * pending requests carry the name only.
 */

/** Requests / upcoming caps — either bucket outgrowing this is a support case. */
const OPEN_BUCKET_LIMIT = 200;

/** Past bookings per page. */
export const PAST_PAGE_SIZE = 50;

/** Statuses where the host legitimately needs the guest's contact. */
const CONTACT_VISIBLE_STATUSES: readonly HostBookingRow['status'][] = ['confirmed', 'completed'];

export interface HostBookingsFilter {
  /** Case-insensitive match on guest name or booking reference code. */
  q?: string;
  /** Restrict to one experience (UUID — ignored if malformed). */
  experienceId?: string;
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

function toRow(row: {
  booking: typeof bookings.$inferSelect;
  experienceSlug: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  guestName: string;
  guestPhone: string | null;
}): HostBookingRow {
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    row.booking.totalAmount,
    row.booking.commissionBps,
    row.booking.vatRateBps,
  );
  const contactVisible = CONTACT_VISIBLE_STATUSES.includes(row.booking.status);
  return {
    id: row.booking.id,
    reference: row.booking.idempotencyKey,
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
    guestName: row.guestName,
    guestPhone: contactVisible ? row.guestPhone : null,
  };
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
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId || !serverEnv.DATABASE_URL) return empty;

  const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
    new Date(),
  );
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
  const base = and(...conditions);

  const selection = {
    booking: bookings,
    experienceSlug: experiences.slug,
    experienceTitleEn: experiences.titleEn,
    experienceTitleAr: experiences.titleAr,
    guestName: guests.name,
    guestPhone: guests.phone,
  };
  const fromJoined = () =>
    db
      .select(selection)
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(bookings.guestId, guests.id));

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
    reportError(error, { surface: 'host-bookings:list' });
    return empty;
  }
}

/** One upcoming booking as the overview preview renders it. */
export interface UpcomingBookingRow {
  id: string;
  date: string;
  startTime: string;
  partySize: number;
  guestName: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
}

/**
 * The next few confirmed bookings (today or later, Riyadh day),
 * soonest-first — the overview's "what's coming up" preview. Minimal
 * columns on purpose; the full row set stays on /host/bookings.
 */
export async function listUpcomingBookingsForHost(
  limit: number,
): Promise<readonly UpcomingBookingRow[]> {
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId || !serverEnv.DATABASE_URL) return [];
  const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
    new Date(),
  );
  try {
    const rows = await db
      .select({
        id: bookings.id,
        date: bookings.date,
        startTime: bookings.startTime,
        partySize: bookings.partySize,
        guestName: guests.name,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(
        and(
          eq(experiences.hostId, hostId),
          eq(bookings.status, 'confirmed'),
          gte(bookings.date, todayRiyadh),
        ),
      )
      .orderBy(asc(bookings.date), asc(bookings.startTime))
      .limit(limit);
    return rows;
  } catch (error) {
    reportError(error, { surface: 'host-bookings:listUpcoming' });
    return [];
  }
}

/**
 * Count of pending (request-mode) bookings awaiting this host's
 * decision — the dashboard badge that pulls hosts into /host/bookings.
 */
export async function countPendingRequestsForHost(): Promise<number> {
  const hostId = await getCurrentHostIdForWrite();
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
