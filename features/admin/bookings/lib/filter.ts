import type { AdminBookingRow, AdminBookingStatus } from '@/features/admin/bookings/types';

/**
 * Pure client-of-the-DB filtering for the admin bookings list. At launch
 * scale we load the (capped) list once and filter in memory, which keeps
 * the query simple and these rules unit-testable.
 */

export type BookingView = 'all' | 'upcoming';
export type BookingStatusFilter = AdminBookingStatus | 'all';

export interface BookingFilter {
  /** Free-text match across reference, phone, guest name, experience title. */
  q?: string;
  status?: BookingStatusFilter;
  view?: BookingView;
  /** Only bookings with a stamped refund_due_sar (money owed back). */
  refundDue?: boolean;
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

/** Statuses considered "live" for the upcoming view. */
const UPCOMING_STATUSES = new Set<AdminBookingStatus>(['pending', 'confirmed']);

function matchesQuery(row: AdminBookingRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  // Digits-only variant so a phone search ignores spaces / +966 formatting.
  const digits = needle.replace(/\D/g, '');
  const haystacks = [
    row.reference.toLowerCase(),
    row.guestName.toLowerCase(),
    row.experienceTitleEn.toLowerCase(),
  ];
  if (haystacks.some((h) => h.includes(needle))) return true;
  if (digits.length > 0) {
    const phoneDigits = (row.guestPhone ?? '').replace(/\D/g, '');
    // Match the E.164 store against a locally-typed number too: a guest
    // saved as +966 51… should be found by "0512…" (strip the leading 0).
    const localized = digits.replace(/^0+/, '');
    if (phoneDigits.includes(digits) || (localized && phoneDigits.includes(localized))) {
      return true;
    }
  }
  return false;
}

export function filterBookings(
  rows: readonly AdminBookingRow[],
  filter: BookingFilter,
): AdminBookingRow[] {
  const view = filter.view ?? 'all';
  const status = filter.status ?? 'all';
  const q = filter.q ?? '';

  let out = rows.filter((row) => {
    if (filter.refundDue && row.refundDueSar === null) return false;
    if (status !== 'all' && row.status !== status) return false;
    if (view === 'upcoming') {
      if (!UPCOMING_STATUSES.has(row.status)) return false;
      if (row.date < filter.todayStr) return false;
    }
    if (!matchesQuery(row, q)) return false;
    return true;
  });

  if (view === 'upcoming') {
    // Soonest experience date first (then start time) — operational order.
    out = [...out].sort(
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    );
  }
  return out;
}
