import type { z } from 'zod';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { FIELD_NAMES, type BookingRequestState } from '@/features/bookings/lib/request/types';

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Every text and checkbox value echoed back on a failed submit. */
export function currentValues(formData: FormData): BookingRequestState['values'] {
  return {
    name: formValue(formData, 'name'),
    phone: formValue(formData, 'phone'),
    preferredDate: formValue(formData, 'preferredDate'),
    partySize: formValue(formData, 'partySize'),
    email: formValue(formData, 'email'),
    womenOnly: formValue(formData, 'womenOnly'),
    terms: formValue(formData, 'terms'),
    minAge: formValue(formData, 'minAge'),
    marketingConsent: formValue(formData, 'marketingConsent'),
    guestNote: formValue(formData, 'guestNote'),
  };
}

/** Step 1 — shape validation. A failure carries the per-field codes and the echo. */
export function parseBookingRequest(
  formData: FormData,
): { input: BookingRequestInput } | { state: BookingRequestState } {
  const parsed = bookingRequestSchema.safeParse({
    experienceSlug: formValue(formData, 'experienceSlug'),
    locale: formValue(formData, 'locale'),
    name: formValue(formData, 'name'),
    phone: formValue(formData, 'phone'),
    preferredDate: formValue(formData, 'preferredDate'),
    partySize: formValue(formData, 'partySize'),
    email: formValue(formData, 'email'),
    idempotencyKey: formValue(formData, 'idempotencyKey'),
    supersedes: formValue(formData, 'supersedes'),
    supersedesToken: formValue(formData, 'supersedesToken'),
    utmSource: formValue(formData, 'utmSource'),
    utmMedium: formValue(formData, 'utmMedium'),
    utmCampaign: formValue(formData, 'utmCampaign'),
    gclid: formValue(formData, 'gclid'),
    ttclid: formValue(formData, 'ttclid'),
    fbclid: formValue(formData, 'fbclid'),
    // Guest-to-guest referral code, posted by the form from the ?ref=
    // landing param. Was missing from this parse input, so every booking
    // since 2026-08-15 was stamped referralCode NULL and no referral
    // reward could ever fire (2026-09 engineering audit ACTIONS-01).
    referralCode: formValue(formData, 'referralCode'),
    marketingConsent: formValue(formData, 'marketingConsent'),
    guestNote: formValue(formData, 'guestNote'),
  });
  if (parsed.success) return { input: parsed.data };

  const fields: BookingRequestState['fields'] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && FIELD_NAMES.includes(key as (typeof FIELD_NAMES)[number])) {
      fields[key as keyof typeof fields] = issue.message;
    }
  }
  return {
    state: { success: false, message: 'validation', fields, values: currentValues(formData) },
  };
}
