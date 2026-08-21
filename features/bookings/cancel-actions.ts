'use server';

import { revalidatePath } from 'next/cache';
import { serverEnv } from '@/lib/env';
import { cancelBookingSchema } from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { cancelBookingCore, type CancelBookingState } from '@/features/bookings/lib/cancel-core';

/**
 * Guest self-service cancellation: cancellable any time before the
 * experience starts; what happens to a *paid* booking's money (full /
 * partial / forfeited refund) comes from the cancellation-policy
 * snapshot stamped on the booking at creation — see
 * `features/bookings/lib/policy.ts` for the tiers and the post-booking
 * grace rule. The page renders the same `bookingOptions()` verdict this
 * action re-checks, so the UI can never offer what the server refuses.
 *
 * Refund execution is gateway-first with a manual fallback: we try the
 * HyperPay refund API against the original payment; if the gateway
 * refuses (or isn't configured), the booking is stamped
 * `refundDueSar` and stays `cancelled` — the admin reverses the charge
 * in the HyperPay console and records it with the admin refund action.
 * The guest-facing copy distinguishes "refund issued" from "refund on
 * its way" so we never claim money moved when it didn't.
 *
 * Authorization matches the booking detail page: the caller must own
 * the booking (signed-in guest) or hold its reference in the
 * last-booking cookie. The reference alone is NOT enough.
 */

export type { CancelBookingState } from '@/features/bookings/lib/cancel-core';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function cancelBookingAsGuest(
  _previous: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const parsed = cancelBookingSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  // The form's locale is validated but no longer drives the notification
  // language — senders read the guest's stored preference.
  const { reference } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  const outcome = await cancelBookingCore({
    reference,
    actor: 'guest',
    authorize: (guestId) => bookingViewerCanAccess(reference, guestId),
  });
  if (!outcome.success) return outcome;

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/host/bookings', 'page');
  return outcome;
}
