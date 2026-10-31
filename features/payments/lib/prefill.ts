import type { StoredBilling } from '@/features/payments/queries';

export interface PaymentPrefillInput {
  /** `BookingDetail.guestName` — the guest ROW's name. */
  guestName: string;
  /** `BookingDetail.guestEmail` — the guest ROW's email. */
  guestEmail: string | null;
  /** The row's saved billing address; `{}` when none or not read. */
  storedBilling: StoredBilling;
  /**
   * Whether this booking's viewer may see the row at all
   * (`guestRowReadableForBooking`). False ⇒ nothing from the row is
   * offered: an anonymous row keyed by a typed phone is shared by
   * everyone who types that number, and a stranger's pay page must not
   * carry the real guest's name, email and address (#264, 2026-10-31).
   */
  rowReadable: boolean;
}

export interface PaymentPrefill {
  defaults: {
    givenName: string;
    surname: string;
    email?: string;
    street1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country: string;
  };
  /** Name and email present: the checkout can be prepared on load. */
  identityComplete: boolean;
  /** A stored card address makes a CARD checkout preparable blind. */
  addressComplete: boolean;
}

/**
 * The payment step's form defaults. Split the guest name into
 * given/surname (the server echo still wins on a failed submit). Most
 * names have a final token as the surname; a single token (a given name
 * alone is common in Arabic entries) fills BOTH — the gateway's 3DS2
 * fields just need a non-empty surname, and leaving it blank reopened
 * the identity block for exactly the guests with the least to type.
 * Editable on the form.
 */
export function paymentPrefill(input: PaymentPrefillInput): PaymentPrefill {
  if (!input.rowReadable) {
    return {
      defaults: { givenName: '', surname: '', country: 'SA' },
      identityComplete: false,
      addressComplete: false,
    };
  }
  const fullName = input.guestName.trim();
  const lastSpace = fullName.lastIndexOf(' ');
  const nameDefaults =
    lastSpace === -1
      ? { givenName: fullName, surname: fullName }
      : {
          givenName: fullName.slice(0, lastSpace).trim(),
          surname: fullName.slice(lastSpace + 1).trim(),
        };
  const { storedBilling } = input;
  const defaults = {
    ...nameDefaults,
    ...(input.guestEmail ? { email: input.guestEmail } : {}),
    ...storedBilling,
    country: storedBilling.country ?? 'SA',
  };
  return {
    defaults,
    identityComplete: Boolean(defaults.givenName && defaults.surname && defaults.email),
    addressComplete: Boolean(storedBilling.street1 && storedBilling.city && storedBilling.postcode),
  };
}
