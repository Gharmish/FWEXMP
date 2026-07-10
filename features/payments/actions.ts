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
import { latestPaymentEvent, recordPaymentEvent } from '@/features/payments/ledger';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';
import { SITE_URL } from '@/lib/site';

/**
 * How long a prepared COPYandPAY checkout is treated as reusable. The
 * gateway keeps a checkout valid ~30 minutes; staying under that means
 * a second tab (or a re-submit) gets the SAME checkout id instead of
 * silently overwriting it — an overwritten id is an orphan-charge path:
 * settle only ever queries the latest checkout, so a capture completed
 * on an older widget would be invisible.
 */
const CHECKOUT_REUSE_MINUTES = 25;

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
  // Explicit clickwrap consent. The checkbox posts `on` only when ticked;
  // an absent/other value fails here, so a tampered or scripted submit can
  // never reach a checkout without the guest having accepted the terms.
  terms: z.literal('on'),
});

export interface CheckoutReady {
  checkoutId: string;
  /** Base URL the `paymentWidgets.js` script is served from. */
  scriptBaseUrl: string;
  /** Absolute `shopperResultUrl` the widget posts back to. */
  returnUrl: string;
  /**
   * Brand order for the widget: Apple Pay first (the widget hides it on
   * devices that can't pay), then cards Mada-first as required by Saudi
   * Payments.
   */
  brands: string;
}

export interface CreateCheckoutState {
  status: 'idle' | 'error' | 'ready';
  /** Form-level error code (translated client-side). */
  error?: string;
  /** Per-field validation codes (`terms` flags a missing consent tick). */
  fields?: Partial<Record<DetailField | 'terms', string>>;
  /**
   * Echoed values so the form survives a failed submit — includes `terms`
   * ('on' | '') so the consent checkbox re-defaults to checked after React
   * 19's post-action form reset.
   */
  values?: Partial<Record<DetailField | 'terms', string>>;
  /** Present only when `status === 'ready'`. */
  data?: CheckoutReady;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function echoValues(formData: FormData): CreateCheckoutState['values'] {
  return {
    ...Object.fromEntries(DETAIL_FIELDS.map((key) => [key, formValue(formData, key)])),
    // Raw consent value so the checkbox re-defaults to checked on a failed submit.
    terms: formValue(formData, 'terms'),
  };
}

/**
 * Origin for the widget's `shopperResultUrl` (where 3DS sends the
 * shopper back). Prefer the explicitly configured canonical origin —
 * deriving it from request headers is safe on Vercel (platform-set) but
 * host-header poisoning behind any other fronting could send the
 * shopper to an attacker origin after 3DS (2026-07 audit L1;
 * phishing-adjacent only — settlement never trusts the redirect). The
 * header fallback keeps localhost and preview deployments working
 * without per-environment config; set NEXT_PUBLIC_SITE_URL in
 * production to pin it.
 */
async function requestOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return SITE_URL;
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
    terms: formValue(formData, 'terms'),
  });

  if (!parsed.success) {
    const fields: CreateCheckoutState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'terms') {
        fields.terms = 'required';
      } else if (typeof key === 'string' && DETAIL_FIELDS.includes(key as DetailField)) {
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
        checkoutId: true,
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
    // `failed` is included: a failed attempt may be retried, but only while
    // the hold is still live — past the deadline the seat no longer counts
    // toward capacity, so paying late would oversell the date.
    if (
      (booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed') &&
      isHoldExpired(booking.paymentDeadline, new Date())
    ) {
      return { status: 'error', error: 'expired', values: echoValues(formData) };
    }

    // Persist the payment-step email onto the guest if we don't have one yet,
    // so the confirmation receipt can reach them (the booking form only
    // collects name + phone). Set-if-empty — never overwrite an existing one.
    await db
      .update(guests)
      .set({ email: input.email })
      .where(and(eq(guests.id, booking.guestId), isNull(guests.email)));

    // Remember the billing address so a returning guest doesn't retype it —
    // the next checkout's payment step prefills these. Always overwrites with
    // the latest submitted address (unlike email): the guest just typed it, so
    // it's the freshest one on file. `state` may be empty (optional for KSA).
    await db
      .update(guests)
      .set({
        billingStreet1: input.street1,
        billingCity: input.city,
        billingState: input.state || null,
        billingPostcode: input.postcode,
        billingCountry: input.country,
      })
      .where(eq(guests.id, booking.guestId));

    // Record the guest's clickwrap consent as append-only proof — who
    // (bookingId → guest), when (createdAt), and which document version
    // (gatewayId). The enforceable gate is the `terms` validation above;
    // this row is the evidence, so it's best-effort like the other
    // informative ledger writes and never blocks a valid payment.
    try {
      await recordPaymentEvent({
        bookingId: booking.id,
        type: 'terms_accepted',
        gatewayId: CURRENT_TERMS_VERSION,
      });
    } catch (error) {
      reportError(error, {
        surface: 'payment-create-checkout:consent',
        reference: input.reference,
      });
    }

    const origin = await requestOrigin();
    const returnUrl = `${origin}/${input.locale}/book/${input.reference}/pay/return?slug=${encodeURIComponent(input.slug)}`;
    const ready = (checkoutId: string): CreateCheckoutState => ({
      status: 'ready',
      data: {
        checkoutId,
        scriptBaseUrl: hyperpayBaseUrl(),
        returnUrl,
        brands: 'APPLEPAY MADA VISA MASTER',
      },
    });

    // A `processing` booking already holds a checkout. If it's still
    // inside the gateway's validity window, hand the SAME id back
    // (second tab, re-submit) instead of overwriting it; if it has aged
    // out, log the supersession so a late capture on the old checkout
    // can still be traced during reconciliation.
    if (booking.paymentStatus === 'processing' && booking.checkoutId) {
      const created = await latestPaymentEvent(booking.id, 'checkout_created');
      const fresh =
        created?.gatewayId === booking.checkoutId &&
        Date.now() - created.createdAt.getTime() < CHECKOUT_REUSE_MINUTES * 60_000;
      if (fresh) return ready(booking.checkoutId);
      try {
        await recordPaymentEvent({
          bookingId: booking.id,
          type: 'checkout_superseded',
          amountSar: booking.totalAmount,
          gatewayId: booking.checkoutId,
        });
      } catch (error) {
        reportError(error, {
          surface: 'payment-create-checkout:ledger',
          reference: input.reference,
        });
      }
    }

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
    // The reuse window above keys off this event's timestamp.
    try {
      await recordPaymentEvent({
        bookingId: booking.id,
        type: 'checkout_created',
        amountSar: booking.totalAmount,
        gatewayId: checkout.id,
      });
    } catch (error) {
      reportError(error, { surface: 'payment-create-checkout:ledger', reference: input.reference });
    }

    return ready(checkout.id);
  } catch (error) {
    reportError(error, { surface: 'payment-create-checkout', reference: input.reference });
    return { status: 'error', error: 'server', values: echoValues(formData) };
  }
}
