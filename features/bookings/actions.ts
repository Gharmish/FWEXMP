'use server';

import { readAdConsent } from '@/lib/consent-server';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { currentValues, parseBookingRequest } from '@/features/bookings/lib/request/form';
import { writeLastBookingCookie } from '@/features/bookings/lib/request/last-booking-cookie';
import { isIdempotencyReplay, replayLanding } from '@/features/bookings/lib/request/replay';
import {
  experienceGates,
  loadBookableExperience,
} from '@/features/bookings/lib/request/experience';
import {
  releaseSupersededHold,
  resolveSupersededHold,
} from '@/features/bookings/lib/request/supersede';
import { holdThrottles } from '@/features/bookings/lib/request/throttle';
import { resolveBookingGuest } from '@/features/bookings/lib/request/guest';
import { bookingRowValues, insertBookingIfRoom } from '@/features/bookings/lib/request/insert';
import { queueBookingEmails } from '@/features/bookings/lib/request/notify';
import type { BookingRequestState } from '@/features/bookings/lib/request/types';

export type {
  BookingRequestState,
  OpenBookingSummary,
} from '@/features/bookings/lib/request/types';

/**
 * Create a booking request (or an instant payment hold). The steps live
 * in features/bookings/lib/request/* in the order they run here (2026-09
 * engineering audit ARCH-07 — this action was a 650-line function):
 *
 *   1. parse         shape validation, per-field codes, value echo
 *   2. replay        an already-used idempotency key lands on the existing booking
 *   3. experience    only live listings from non-suspended hosts
 *   4. gates         terms / women-only / min-age attestations, party size, date
 *   5. supersede     a verified replacement of an unpaid instant hold
 *   6. throttles     active unpaid holds per phone, creations per IP per hour
 *   7. guest         the guest row (account-linked or anonymous), suspension check
 *   8. values        the row, with policy/commission snapshots and consent stamps
 *   9. insert        under the experience row lock, only if the date has room
 *  10. release       free the superseded hold now that its replacement exists
 *  11. notify        host + guest emails after the response has flushed
 *
 * Where the guest lands depends on the experience's booking mode
 * (pay-after-approval model, owner decision 2026-06-10): instant with
 * payment on → the payment step (the booking holds the spot while the
 * guest pays; confirmed on settle); request → the confirmation page in
 * its "pending host approval" state. The guest is NEVER charged before
 * the host approves.
 *
 * The success path throws Next's `redirect()`, so the observable state
 * is always a failure shape; `redirect()` is only ever called OUTSIDE
 * the try below so its control-flow throw is never caught.
 */
export async function requestBooking(
  _previousState: BookingRequestState,
  formData: FormData,
): Promise<BookingRequestState> {
  const parsed = parseBookingRequest(formData);
  if ('state' in parsed) return parsed.state;
  const input = parsed.input;

  const adConsent = await readAdConsent();
  // The client mints the key when the form mounts (see schemas.ts) so a
  // retry re-sends the same one; server-minted fallback keeps keyless
  // posters working but without retry protection.
  const reference = input.idempotencyKey ?? crypto.randomUUID();
  const slugParam = `slug=${encodeURIComponent(input.experienceSlug)}`;
  const confirmedPath = `/book/confirmed/${reference}?${slugParam}`;
  const payPath = `/book/${reference}/pay?${slugParam}`;
  let nextPath: string = confirmedPath;

  if (!serverEnv.DATABASE_URL) {
    // Preview mode: nothing is persisted, but we still navigate to the
    // confirmation page so the user lands somewhere real. The page
    // renders preview copy when getBookingByReference returns undefined.
    await writeLastBookingCookie(reference, input.experienceSlug);
    redirect({ href: confirmedPath, locale: input.locale });
  }

  if (input.idempotencyKey) {
    const landing = await replayLanding(reference, { pay: payPath, confirmed: confirmedPath });
    if (landing) {
      await writeLastBookingCookie(reference, input.experienceSlug);
      redirect({ href: landing, locale: input.locale });
    }
  }

  try {
    const experience = await loadBookableExperience(input.experienceSlug);
    if (!experience) {
      return { success: false, message: 'notFound', values: currentValues(formData) };
    }
    const gate = experienceGates(experience, input, formData);
    if (gate) return gate;

    const supersededHold = await resolveSupersededHold(input, reference);
    const throttled = await holdThrottles(input, supersededHold, formData);
    if (throttled.state) return throttled.state;

    const resolved = await resolveBookingGuest(input);
    if ('suspended' in resolved) {
      return { success: false, message: 'suspended', values: currentValues(formData) };
    }

    const values = await bookingRowValues(experience, input, {
      guestId: resolved.guest.id,
      reference,
      ip: throttled.ip,
      adConsent,
    });
    if (experience.bookingMode === 'instant' && hasHyperpay()) nextPath = payPath;

    const outcome = await insertBookingIfRoom(experience, input, values);
    if (outcome === 'full') {
      return {
        success: false,
        message: 'date_full',
        fields: { preferredDate: 'date_full' },
        values: currentValues(formData),
      };
    }
    if (supersededHold) await releaseSupersededHold(supersededHold, reference);
  } catch (error) {
    // Race-proof replay backstop: two concurrent retries can both pass the
    // fast path above; the loser's insert hits the idempotency-key unique
    // constraint. The winner's booking stands — land this caller on it.
    // Emails are the winner's job; skipping them here IS the dedupe.
    if (isIdempotencyReplay(error)) {
      await writeLastBookingCookie(reference, input.experienceSlug);
      redirect({ href: nextPath, locale: input.locale });
    }
    reportError(error, { surface: 'booking-request', experienceSlug: input.experienceSlug });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  queueBookingEmails(reference);
  await writeLastBookingCookie(reference, input.experienceSlug);
  redirect({ href: nextPath, locale: input.locale });
}
