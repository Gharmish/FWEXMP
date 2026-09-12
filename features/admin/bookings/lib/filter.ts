import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { bookings, experiences, guests, hosts } from '@/db/schema';
import type { AdminBookingStatus } from '@/features/admin/bookings/types';

export type BookingView = 'all' | 'upcoming';
export type BookingStatusFilter = AdminBookingStatus | 'all';

export interface BookingFilter {
  /** Free-text match across reference, phone, guest name, experience title. */
  q?: string;
  status?: BookingStatusFilter;
  view?: BookingView;
  /** Only bookings with a stamped refund_due_sar (money owed back). */
  refundDue?: boolean;
  /**
   * Only UPCOMING ACTIVE bookings whose host is suspended — the operator
   * queue for emergency takedowns (2026-08-02 ops audit P0-1). Mirrors
   * the dashboard tile's definition exactly: pending/confirmed, date not
   * yet passed, host currently suspended.
   */
  suspendedHost?: boolean;
  /** Today, `YYYY-MM-DD`, for the "upcoming" cutoff. */
  todayStr: string;
}

const STATUSES: readonly AdminBookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'refunded',
  'declined',
  'expired',
];

export function normalizeStatus(raw: string | undefined): BookingStatusFilter {
  if (raw && (STATUSES as readonly string[]).includes(raw)) return raw as AdminBookingStatus;
  return 'all';
}

export function normalizeView(raw: string | undefined): BookingView {
  return raw === 'upcoming' ? 'upcoming' : 'all';
}

const UPCOMING_STATUSES: readonly AdminBookingStatus[] = ['pending', 'confirmed'];

/** Escape the LIKE metacharacters in user input. */
function likePattern(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The free-text search as SQL (2026-09 engineering audit DATA-04 — the
 * queue used to load the newest 500 rows and filter them in memory, so
 * older bookings were invisible to every search). Reference, short code,
 * guest name and experience title match case-insensitively; a phone
 * search compares digits only, with and without the local leading zero,
 * against the booking's contact phone or the guest's stored one.
 */
function searchWhere(q: string): SQL | undefined {
  const needle = q.trim().toLowerCase();
  if (!needle) return undefined;
  const pattern = likePattern(needle);
  const parts: SQL[] = [
    ilike(bookings.idempotencyKey, pattern),
    ilike(bookings.referenceCode, pattern),
    ilike(guests.name, pattern),
    ilike(experiences.titleEn, pattern),
  ];
  const digits = needle.replace(/\D/g, '');
  if (digits.length > 0) {
    const phoneDigits = sql`regexp_replace(coalesce(${bookings.contactPhone}, ${guests.phone}, ''), '\\D', '', 'g')`;
    parts.push(sql`${phoneDigits} like ${`%${digits}%`}`);
    const localized = digits.replace(/^0+/, '');
    if (localized && localized !== digits) parts.push(sql`${phoneDigits} like ${`%${localized}%`}`);
  }
  return or(...parts);
}

/**
 * WHERE for the admin queue. Expects `bookings` joined to `experiences`,
 * `hosts` and `guests` (see listBookingsForAdmin). Undefined = no filter.
 */
export function bookingFilterWhere(filter: BookingFilter): SQL | undefined {
  const clauses: SQL[] = [];
  const status = filter.status ?? 'all';
  const view = filter.view ?? 'all';
  if (filter.refundDue) clauses.push(isNotNull(bookings.refundDueSar));
  if (filter.suspendedHost) {
    clauses.push(
      eq(hosts.verificationStatus, 'suspended'),
      inArray(bookings.status, [...UPCOMING_STATUSES]),
      gte(bookings.date, filter.todayStr),
    );
  }
  if (status !== 'all') clauses.push(eq(bookings.status, status));
  if (view === 'upcoming') {
    clauses.push(
      inArray(bookings.status, [...UPCOMING_STATUSES]),
      gte(bookings.date, filter.todayStr),
    );
  }
  const search = searchWhere(filter.q ?? '');
  if (search) clauses.push(search);
  return clauses.length > 0 ? and(...clauses) : undefined;
}

/** Soonest experience first for the upcoming view; newest booking first otherwise. */
export function bookingFilterOrder(filter: BookingFilter): SQL[] {
  return (filter.view ?? 'all') === 'upcoming'
    ? [asc(bookings.date), asc(bookings.startTime)]
    : [desc(bookings.createdAt)];
}
