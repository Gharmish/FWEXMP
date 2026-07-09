import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * The billing address last saved for a booking's guest (see
 * createCheckout). Every field optional: a guest who never completed a
 * checkout has none, and `state` is optional for KSA. Shaped to the
 * payment form's field names so the page can spread it into `defaults`.
 */
export interface StoredBilling {
  street1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

/**
 * Load the stored billing address for the guest behind `reference`, to
 * prefill the payment step. Callers must have already authorized the
 * viewer for this booking (the pay page gates on
 * `getBookingByReferenceForViewer` first). Empty object when the DB is
 * off, the booking is unknown, or nothing was ever saved.
 */
export async function getStoredBillingForBooking(reference: string): Promise<StoredBilling> {
  if (!serverEnv.DATABASE_URL) return {};
  try {
    const row = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      // Minimal selection: an empty `columns` object would select every
      // bookings column, and we only need the guest relation.
      columns: { id: true },
      with: {
        guest: {
          columns: {
            billingStreet1: true,
            billingCity: true,
            billingState: true,
            billingPostcode: true,
            billingCountry: true,
          },
        },
      },
    });
    if (!row) return {};
    const g = row.guest;
    const out: StoredBilling = {};
    if (g.billingStreet1) out.street1 = g.billingStreet1;
    if (g.billingCity) out.city = g.billingCity;
    if (g.billingState) out.state = g.billingState;
    if (g.billingPostcode) out.postcode = g.billingPostcode;
    if (g.billingCountry) out.country = g.billingCountry;
    return out;
  } catch (error) {
    // Prefill only — a read hiccup must leave the address blank, not break
    // the payment step.
    reportError(error, { surface: 'payments:getStoredBillingForBooking', reference });
    return {};
  }
}
