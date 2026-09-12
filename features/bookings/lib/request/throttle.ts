import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';
import { bookings, experiences, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import { currentValues, type BookingRequestInput } from '@/features/bookings/lib/request/form';
import type { SupersededHold } from '@/features/bookings/lib/request/supersede';
import type {
  BookingRequestState,
  OpenBookingSummary,
} from '@/features/bookings/lib/request/types';

/**
 * Booking-spam throttles. Bookings need no account and no payment to
 * hold capacity (pending requests and instant payment holds), so
 * creation is rate-limited:
 *   - per phone: at most this many bookings still holding a spot
 *     without payment (`pending`, or `confirmed` and not yet paid);
 *   - per IP: at most this many bookings created in the last hour.
 */
const MAX_ACTIVE_HOLDS_PER_PHONE = 3;
const MAX_BOOKINGS_PER_IP_PER_HOUR = 10;

/** First hop of x-forwarded-for — the client IP on Vercel. Null locally. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * The per-phone throttle's definition of a booking that still holds a
 * spot without payment. Shared by the count that trips `too_many` and
 * the lookup that shows the guest which bookings are holding it.
 */
function activePhoneHolds(phone: string) {
  return and(
    // Counts on the BOOKING's contact phone, not the guest row's
    // identity phone (2026-07-28 third audit). An email-OTP account's
    // guest row deliberately carries no phone, so a guest-row match made
    // those bookings invisible to the cap — one such account could hold
    // unlimited unpaid seats and capacity-block an experience.
    eq(bookings.contactPhone, phone),
    inArray(bookings.status, ['pending', 'confirmed']),
    ne(bookings.paymentStatus, 'paid'),
    // Lapsed payment holds AND lapsed approval windows both stop
    // counting here — the latter predicate moved into holdStillCounts
    // (2026-08-02 ops audit) so capacity sums agree with this throttle.
    holdStillCounts(),
  );
}

/**
 * The open bookings behind a tripped throttle, but only when the caller
 * verifiably owns them: a signed-in account whose linked guest row holds
 * the submitted phone sees all of them; otherwise the device's
 * last-booking cookie vouches for (at most) the one booking it points
 * at. Anything less verified returns [] and the form stays generic —
 * typing someone else's phone number must never list their bookings.
 * Best-effort: any failure degrades to the generic message.
 */
async function verifiedOpenBookings(
  phone: string,
  locale: 'en' | 'ar',
): Promise<OpenBookingSummary[]> {
  try {
    const rows = await db
      .select({
        reference: bookings.idempotencyKey,
        referenceCode: bookings.referenceCode,
        experienceSlug: experiences.slug,
        titleEn: experiences.titleEn,
        titleAr: experiences.titleAr,
        date: bookings.date,
        status: bookings.status,
        paymentDeadline: bookings.paymentDeadline,
      })
      .from(bookings)
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(activePhoneHolds(phone))
      .orderBy(desc(bookings.createdAt))
      .limit(5);
    if (rows.length === 0) return [];

    const toSummary = (row: (typeof rows)[number]): OpenBookingSummary => ({
      reference: row.reference,
      referenceCode: row.referenceCode,
      experienceSlug: row.experienceSlug,
      title: locale === 'ar' ? row.titleAr : row.titleEn,
      date: row.date,
      // A pending row awaits the host; a confirmed row with a payment
      // deadline awaits payment; confirmed without one (payments off)
      // just sits until its date — nothing to pay, only cancellable.
      state:
        row.status === 'pending'
          ? 'approval'
          : row.paymentDeadline !== null
            ? 'payment'
            : 'confirmed',
    });

    const user = await getCurrentUser();
    if (user) {
      const own = await db.query.guests.findFirst({
        where: (g) => eq(g.authUserId, user.id),
        columns: { phone: true },
      });
      if (own?.phone === phone) return rows.map(toSummary);
    }

    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    const cookieRow = hint ? rows.find((row) => row.reference === hint.reference) : undefined;
    return cookieRow ? [toSummary(cookieRow)] : [];
  } catch (error) {
    reportError(error, { surface: 'bookings:verifiedOpenBookings' });
    return [];
  }
}

/**
 * Step 6 — throttle creation before any write. Both axes are capped:
 * active unpaid holds per phone, and creations per IP per hour. Lapsed
 * holds are excluded the same way capacity sums exclude them
 * (`holdStillCounts`): an abandoned checkout must not lock the guest out
 * of booking again. A verified superseded hold is being replaced, not
 * stacked, so it does not consume one of the guest's allowed open holds.
 */
export async function holdThrottles(
  input: BookingRequestInput,
  supersededHold: SupersededHold | null,
  formData: FormData,
): Promise<{ ip: string | null; state: BookingRequestState | null }> {
  const ip = await clientIp();
  const [{ activeForPhone }] = await db
    .select({ activeForPhone: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(guests, eq(bookings.guestId, guests.id))
    .where(activePhoneHolds(input.phone));
  const effectiveHoldsForPhone = activeForPhone - (supersededHold?.countsForPhone ? 1 : 0);
  if (effectiveHoldsForPhone >= MAX_ACTIVE_HOLDS_PER_PHONE) {
    return {
      ip,
      state: {
        success: false,
        message: 'too_many',
        openBookings: await verifiedOpenBookings(input.phone, input.locale),
        values: currentValues(formData),
      },
    };
  }
  if (ip) {
    const [{ recentForIp }] = await db
      .select({ recentForIp: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(eq(bookings.createdIp, ip), gte(bookings.createdAt, new Date(Date.now() - 3_600_000))),
      );
    if (recentForIp >= MAX_BOOKINGS_PER_IP_PER_HOUR) {
      // Distinct code from the per-phone `too_many`: this branch is
      // about the NETWORK (shared café/hotel NAT, not this guest's own
      // open bookings), so the form renders neutral copy without the
      // open-bookings list.
      return {
        ip,
        state: { success: false, message: 'too_many_network', values: currentValues(formData) },
      };
    }
  }
  return { ip, state: null };
}
