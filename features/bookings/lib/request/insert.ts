import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';
import { getPlatformSettings } from '@/lib/platform-settings';
import {
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_HOLD_MINUTES,
  remainingCapacity,
  slotCloseInstantMs,
} from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { getTierSnapshot } from '@/features/bookings/lib/cancellation-policy';
import { generateReferenceCode } from '@/features/bookings/lib/reference-code';
import type { BookableExperience } from '@/features/bookings/lib/request/experience';
import type { BookingRequestInput } from '@/features/bookings/lib/request/form';

export interface BookingRowContext {
  guestId: string;
  /** The idempotency key — the URL capability of the booking. */
  reference: string;
  ip: string | null;
  /** Marketing-cookie consent: ad click ids are persisted only with it. */
  adConsent: boolean;
}

/** Step 8 — everything a new booking row carries, before its mode-specific status. */
export async function bookingRowValues(
  experience: BookableExperience,
  input: BookingRequestInput,
  ctx: BookingRowContext,
) {
  return {
    guestId: ctx.guestId,
    // Per-booking contact snapshot: what the guest typed on THIS form.
    // Hosts reach the guest through it and the hold throttle counts on
    // it, so an account-linked identity row never has to take an
    // unverified phone (see the guests.contactPhone note in schema.ts).
    contactPhone: input.phone,
    experienceId: experience.id,
    date: input.preferredDate,
    startTime: experience.startTime,
    partySize: input.partySize,
    totalAmount: experience.priceSar * input.partySize,
    // Snapshots — a later commission or policy edit applies to future
    // bookings only, never restating an existing booking's terms. The
    // tier's parameters come from the DB source of truth (degrading to
    // the code defaults exactly like the guest-facing surfaces do).
    commissionBps: experience.commissionBps,
    ...(await getTierSnapshot(experience.cancellationTier)),
    idempotencyKey: ctx.reference,
    // Human reference (GH-XXXXXX) — display identity only; the UUID
    // above stays the URL capability. Unique-constraint collision is
    // ~1/730M and lands in the generic server-error path.
    referenceCode: generateReferenceCode(),
    createdIp: ctx.ip,
    // First-touch acquisition source; feeds only the admin dashboard.
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    // Ad-platform click ids + guest referral code, captured with the
    // same first-touch mechanism — offline conversion upload and
    // referral rewards both hang off these at settlement. Click ids are
    // personal data for the platforms that issued them: persisted only
    // when the guest accepted marketing cookies (GAPB-01). Referral codes
    // are not ad identifiers and are kept regardless.
    gclid: ctx.adConsent ? (input.gclid ?? null) : null,
    ttclid: ctx.adConsent ? (input.ttclid ?? null) : null,
    fbclid: ctx.adConsent ? (input.fbclid ?? null) : null,
    referralCode: input.referralCode ?? null,
    // Per-booking snapshot of the marketing-consent checkbox; the
    // durable per-guest grant is stamped on the guest row.
    marketingConsent: input.marketingConsent,
    // The guest's message to the host — shown on the request card.
    guestNote: input.guestNote ?? null,
    // Consent evidence — the checkboxes were enforced by the gates, so a
    // created booking always carries its acceptance stamps and the
    // document version accepted (2026-08-02 legal audit).
    termsAcceptedAt: new Date(),
    termsVersion: CURRENT_TERMS_VERSION,
    womenOnlyAttestedAt: experience.category === 'women_only' ? new Date() : null,
    minAgeAttestedAt: experience.minAge > 0 ? new Date() : null,
  } as const;
}

/**
 * Step 9 — insert only if the date still has room. The experience row is
 * locked for the duration of the transaction so concurrent bookings for
 * the same experience serialize: each re-sums active party sizes on the
 * date and inserts only if there is room. This *closes* the overbook
 * window (a read-then-write TOCTOU otherwise) rather than narrowing it.
 * Capacity is derived from bookings, so the experience row is the lock
 * anchor — the same anchor approve/reschedule take.
 *
 * Request mode used to skip this gate ("the host confirms, capacity is
 * enforced there"), but a `pending` row consumes capacity the moment it
 * exists (2026-08-02 ops audit): free anonymous requests could zero out
 * a calendar for the whole approval window.
 */
export async function insertBookingIfRoom(
  experience: BookableExperience,
  input: BookingRequestInput,
  values: Awaited<ReturnType<typeof bookingRowValues>>,
): Promise<'full' | 'ok'> {
  const insertIfRoom = (row: typeof bookings.$inferInsert): Promise<'full' | 'ok'> =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from ${experiences} where ${experiences.id} = ${experience.id} for update`,
      );
      const [{ booked }] = await tx
        .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.experienceId, experience.id),
            eq(bookings.date, input.preferredDate),
            inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
            holdStillCounts(),
          ),
        );
      if (remainingCapacity(experience.maxGroupSize, booked) < input.partySize) {
        return 'full' as const;
      }
      await tx.insert(bookings).values(row);
      return 'ok' as const;
    });

  if (experience.bookingMode === 'instant') {
    // When online payment is required, stamp a hold deadline: the booking
    // is created `confirmed` (so it holds the spot during payment) but the
    // release job frees it if payment never completes. Null when payment
    // is off — the booking is final on insert and never expires.
    const paymentDeadline = hasHyperpay()
      ? new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000)
      : null;
    return insertIfRoom({ ...values, status: 'confirmed', paymentDeadline });
  }
  // Request mode: the host (or admin) confirms each request, and capacity
  // is re-asserted there under the same lock. The approval window starts
  // now; the cron expires undecided requests past the deadline. Clamped
  // to the slot itself (2026-08-02 ops audit P0-2): `now + 24h` unclamped
  // let a request for tomorrow morning sit pending THROUGH the event
  // while holding its seat. The deadline never extends past local start
  // minus the booking cutoff — the same lead time the date gate just
  // enforced — so an undecided request expires while the guest can still
  // book elsewhere, and a decision always leaves room to pay and attend.
  const { approvalWindowHours } = await getPlatformSettings();
  const windowEndMs = Date.now() + approvalWindowHours * 3_600_000;
  const slotCloseMs = slotCloseInstantMs(
    input.preferredDate,
    experience.startTime,
    experience.bookingCutoffHours * 60,
  );
  const approvalDeadline = new Date(
    slotCloseMs === null ? windowEndMs : Math.min(windowEndMs, slotCloseMs),
  );
  return insertIfRoom({ ...values, status: 'pending', approvalDeadline });
}
