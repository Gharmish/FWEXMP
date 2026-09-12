import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  isDateBookable,
  nowMinutesInRiyadh,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import {
  currentValues,
  formValue,
  type BookingRequestInput,
} from '@/features/bookings/lib/request/form';
import type { BookingRequestState } from '@/features/bookings/lib/request/types';

/**
 * Step 3 — the listing. Only live listings from non-suspended hosts are
 * bookable (2026-08-02 ops audit): the catalog already hides the rest,
 * but this action is reachable by direct POST with any slug, so
 * draft/paused/archived supply — and suspended hosts' listings — could
 * still take bookings that payment would dead-end later. Returns null in
 * every such case; the caller answers `notFound` on purpose (a guest has
 * no business learning that an unpublished slug exists).
 */
export async function loadBookableExperience(slug: string) {
  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, slug),
    columns: {
      id: true,
      status: true,
      priceSar: true,
      maxGroupSize: true,
      startTime: true,
      bookingCutoffHours: true,
      bookingMode: true,
      commissionBps: true,
      cancellationTier: true,
      category: true,
      minAge: true,
      availabilityWeekdays: true,
      blackoutDates: true,
      stopSellDates: true,
    },
    with: { host: { columns: { verificationStatus: true } } },
  });
  if (
    !experience ||
    experience.status !== 'live' ||
    experience.host.verificationStatus === 'suspended'
  ) {
    return null;
  }
  return experience;
}

export type BookableExperience = NonNullable<Awaited<ReturnType<typeof loadBookableExperience>>>;

/**
 * Step 4 — the listing-specific gates, in the order the form shows them.
 * Every one is enforced server-side so an absent or tampered checkbox
 * can never create a booking. Returns the failure state, or null to
 * proceed.
 */
export function experienceGates(
  experience: BookableExperience,
  input: BookingRequestInput,
  formData: FormData,
): BookingRequestState | null {
  const fail = (fields: BookingRequestState['fields']): BookingRequestState => ({
    success: false,
    message: 'validation',
    fields,
    values: currentValues(formData),
  });
  // Terms/Privacy/Cancellation acceptance is required at the booking
  // step, not only at checkout (2026-08-02 legal audit): request-to-book
  // guests who are declined or lapse never reach the payment clickwrap,
  // yet the conduct rules and data processing apply to them too.
  if (formValue(formData, 'terms') !== 'on') return fail({ terms: 'required' });
  // Women-only experiences require an explicit eligibility acknowledgment
  // before a booking can be created (owner decision 2026-07-08 category).
  if (experience.category === 'women_only' && formValue(formData, 'womenOnly') !== 'on') {
    return fail({ womenOnly: 'required' });
  }
  // Experiences with a minimum age require the guest to attest the whole
  // party meets it — `minAge` was display-only before the 2026-08-02
  // audit, so a "minimum age 16" listing accepted any party silently.
  if (experience.minAge > 0 && formValue(formData, 'minAge') !== 'on') {
    return fail({ minAge: 'required' });
  }
  if (input.partySize > experience.maxGroupSize) return fail({ partySize: 'too_large' });
  // The requested day must be open on the calendar for both modes — a
  // request for a day the experience never runs is not actionable. The
  // startTime + now-minutes + cutoff inputs also close today's slot once
  // we're within the lead time of (or past) its local start, so a payment
  // can never be taken for an experience that has already begun.
  const bookable = isDateBookable({
    dateStr: input.preferredDate,
    todayStr: todayInRiyadh(),
    availabilityWeekdays: experience.availabilityWeekdays,
    blackoutDates: experience.blackoutDates,
    stopSellDates: experience.stopSellDates,
    startTime: experience.startTime,
    nowMinutes: nowMinutesInRiyadh(),
    cutoffMinutes: experience.bookingCutoffHours * 60,
  });
  if (!bookable.ok) return fail({ preferredDate: `date_${bookable.reason}` });
  return null;
}
