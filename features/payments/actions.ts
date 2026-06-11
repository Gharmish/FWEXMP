'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { reportError } from '@/lib/log';
import { paymentDetailsSchema } from '@/features/payments/schemas';
import { hyperpayBaseUrl, prepareCheckout } from '@/features/payments/lib/hyperpay';

/**
 * Server action behind the payment-details step. Validates the 3DS2
 * customer/billing fields, prepares a HyperPay checkout for the booking,
 * persists the checkout id, and returns the data the COPYandPAY widget
 * needs. Like the rest of the codebase it never throws to the client —
 * it returns a discriminated state for `useActionState`.
 */

const DETAIL_FIELDS = [
  'givenName',
  'surname',
  'email',
  'street1',
  'city',
  'state',
  'postcode',
  'country',
] as const;
type DetailField = (typeof DETAIL_FIELDS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createCheckoutSchema = paymentDetailsSchema.extend({
  reference: z.string().regex(UUID_RE),
  locale: z.enum(['en', 'ar']),
  slug: z.string().min(1),
});

export interface CheckoutReady {
  checkoutId: string;
  /** Base URL the `paymentWidgets.js` script is served from. */
  scriptBaseUrl: string;
  /** Absolute `shopperResultUrl` the widget posts back to. */
  returnUrl: string;
  /** Mada-first brand order for the widget. */
  brands: string;
}

export interface CreateCheckoutState {
  status: 'idle' | 'error' | 'ready';
  /** Form-level error code (translated client-side). */
  error?: string;
  /** Per-field validation codes. */
  fields?: Partial<Record<DetailField, string>>;
  /** Echoed values so the form survives a failed submit. */
  values?: Partial<Record<DetailField, string>>;
  /** Present only when `status === 'ready'`. */
  data?: CheckoutReady;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function echoValues(formData: FormData): CreateCheckoutState['values'] {
  return Object.fromEntries(DETAIL_FIELDS.map((key) => [key, formValue(formData, key)]));
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function createCheckout(
  _previousState: CreateCheckoutState,
  formData: FormData,
): Promise<CreateCheckoutState> {
  if (!hasHyperpay() || !serverEnv.DATABASE_URL) {
    return { status: 'error', error: 'unavailable' };
  }

  const parsed = createCheckoutSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
    slug: formValue(formData, 'slug'),
    givenName: formValue(formData, 'givenName'),
    surname: formValue(formData, 'surname'),
    email: formValue(formData, 'email'),
    street1: formValue(formData, 'street1'),
    city: formValue(formData, 'city'),
    state: formValue(formData, 'state'),
    postcode: formValue(formData, 'postcode'),
    country: formValue(formData, 'country'),
  });

  if (!parsed.success) {
    const fields: CreateCheckoutState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && DETAIL_FIELDS.includes(key as DetailField)) {
        fields[key as DetailField] = 'invalid';
      }
    }
    return { status: 'error', error: 'validation', fields, values: echoValues(formData) };
  }

  const input = parsed.data;

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, input.reference),
      columns: {
        id: true,
        guestId: true,
        totalAmount: true,
        paymentStatus: true,
        status: true,
        paymentDeadline: true,
      },
    });

    if (!booking) {
      return { status: 'error', error: 'notFound', values: echoValues(formData) };
    }
    // Authorize the caller before touching the booking (set-email, checkout).
    // The reference alone must not let a stranger drive someone's payment or
    // set their email — require ownership or the browser's booking cookie.
    if (!(await bookingViewerCanAccess(input.reference, booking.guestId))) {
      return { status: 'error', error: 'notFound', values: echoValues(formData) };
    }
    if (booking.paymentStatus === 'paid') {
      return { status: 'error', error: 'alreadyPaid', values: echoValues(formData) };
    }
    // Pay-after-approval: a request that the host hasn't approved yet
    // (`pending`) — or that was declined/expired — must never reach a
    // checkout. Only a `confirmed` booking (instant, or an approved
    // request inside its payment window) can be charged.
    if (booking.status === 'pending') {
      return { status: 'error', error: 'notApproved', values: echoValues(formData) };
    }
    if (booking.status !== 'confirmed') {
      return { status: 'error', error: 'expired', values: echoValues(formData) };
    }
    // Never prepare a checkout for a hold that's been released (cancelled) or
    // has expired — this is what makes auto-release safe: a freed spot can
    // never be paid for, so there's no charge-for-a-given-away-seat race.
    if (booking.paymentStatus === 'unpaid' && isHoldExpired(booking.paymentDeadline, new Date())) {
      return { status: 'error', error: 'expired', values: echoValues(formData) };
    }

    // Persist the payment-step email onto the guest if we don't have one yet,
    // so the confirmation receipt can reach them (the booking form only
    // collects name + phone). Set-if-empty — never overwrite an existing one.
    await db
      .update(guests)
      .set({ email: input.email })
      .where(and(eq(guests.id, booking.guestId), isNull(guests.email)));

    const checkout = await prepareCheckout({
      merchantTransactionId: input.reference,
      amountSar: booking.totalAmount,
      customer: { email: input.email, givenName: input.givenName, surname: input.surname },
      billing: {
        street1: input.street1,
        city: input.city,
        state: input.state,
        country: input.country,
        postcode: input.postcode,
      },
    });

    await db
      .update(bookings)
      .set({ checkoutId: checkout.id, paymentStatus: 'processing' })
      .where(eq(bookings.id, booking.id));

    const origin = await requestOrigin();
    const returnUrl = `${origin}/${input.locale}/book/${input.reference}/pay/return?slug=${encodeURIComponent(input.slug)}`;

    return {
      status: 'ready',
      data: {
        checkoutId: checkout.id,
        scriptBaseUrl: hyperpayBaseUrl(),
        returnUrl,
        brands: 'MADA VISA MASTER',
      },
    };
  } catch (error) {
    reportError(error, { surface: 'payment-create-checkout', reference: input.reference });
    return { status: 'error', error: 'server', values: echoValues(formData) };
  }
}
