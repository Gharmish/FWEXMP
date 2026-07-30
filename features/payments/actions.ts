'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay, hasHyperpayApplePay } from '@/lib/env';
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

const createCheckoutSchema = paymentDetailsSchema
  .extend({
    reference: z.string().regex(UUID_RE),
    locale: z.enum(['en', 'ar']),
    slug: z.string().min(1),
    // Payment method chosen before the widget mounts. Apple Pay lives on
    // its own gateway entity, so it needs its own checkout; a tampered or
    // stale 'applepay' submit degrades to 'card' below when the Apple Pay
    // entity isn't configured.
    method: z.enum(['card', 'applepay']).catch('card'),
    // Explicit clickwrap consent. The checkbox posts `on` only when ticked;
    // an absent/other value fails here, so a tampered or scripted submit can
    // never reach a checkout without the guest having accepted the terms.
    terms: z.literal('on'),
    // Billing address is mandatory for CARD checkouts (3DS2/AVS per the
    // HyperPay onboarding email) but not for Apple Pay — the wallet
    // carries the address and the gateway accepts an address-less
    // checkout on the Apple Pay entity. The base schema's per-field
    // minimums are relaxed here and re-imposed for cards below.
    street1: z.string().trim().max(50),
    city: z.string().trim().max(45),
    postcode: z.string().trim().max(30),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'applepay') return;
    if (!data.street1) ctx.addIssue({ code: 'custom', path: ['street1'], message: 'required' });
    if (data.city.length < 2) ctx.addIssue({ code: 'custom', path: ['city'], message: 'required' });
    if (!data.postcode) ctx.addIssue({ code: 'custom', path: ['postcode'], message: 'required' });
    if (!/^[A-Z]{2}$/.test(data.country)) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'required' });
    }
  });

export interface CheckoutReady {
  checkoutId: string;
  /** Base URL the `paymentWidgets.js` script is served from. */
  scriptBaseUrl: string;
  /** Absolute `shopperResultUrl` the widget posts back to. */
  returnUrl: string;
  /**
   * Brands for the widget. Card checkouts are Mada-first as required by
   * Saudi Payments; an Apple Pay checkout carries only APPLEPAY (it lives
   * on a separate gateway entity, so brands can't mix in one checkout).
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
    method: formValue(formData, 'method'),
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
  // Apple Pay requires its dedicated entity; without it, degrade to card
  // so an out-of-date client can still pay.
  const channel = input.method === 'applepay' && hasHyperpayApplePay() ? 'applepay' : 'card';
  // Ledger tag on `checkout_created` — settle and refunds resolve the
  // entity for this checkout from it (old rows without a tag are card).
  const channelTag = channel === 'applepay' ? 'APPLEPAY' : null;

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
        settleAnomalyAt: true,
      },
      // The experience and its host gate the charge too — see below.
      with: {
        experience: {
          columns: { status: true },
          with: { host: { columns: { verificationStatus: true } } },
        },
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
    // An UNMATCHED CAPTURE is outstanding on this booking — refuse to
    // start another one (2026-07-28 seventh audit).
    //
    // The promo/credit settle race leaves the row `confirmed` + `unpaid`
    // with a live deadline while a real capture sits at the gateway that
    // settle could not match. Round 6 hid the Pay-now button for that
    // state but left THIS guard untouched, so /book/[ref]/pay was still
    // directly reachable — second tab, back button, bookmark, or the pay
    // link already in the guest's inbox — and a second checkout charged
    // them twice. Hiding a control is not a guard; this is.
    //
    // Cleared ONLY by the admin action `resolveSettleAnomaly` — this
    // guard returns before the clear further down, so that path is
    // unreachable while the stamp is set. Round 7 shipped this guard
    // with no admin path at all, which made it a permanent lockout;
    // the clear-here clause in that comment was circular.
    if (booking.settleAnomalyAt) {
      return { status: 'error', error: 'underReview', values: echoValues(formData) };
    }
    // NEVER charge for an experience the platform has pulled
    // (2026-07-28 eighth audit). Suspending a host force-pauses their
    // live listings, and pausing an experience takes it off sale — but
    // neither touched bookings, and this action read only the booking
    // row. A guest holding a confirmed unpaid booking could still be
    // charged for an experience withdrawn for safety reasons, which is
    // the one outcome an emergency takedown exists to prevent.
    if (
      booking.experience.status !== 'live' ||
      booking.experience.host.verificationStatus === 'suspended'
    ) {
      return { status: 'error', error: 'unavailable', values: echoValues(formData) };
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
    // Apple Pay submits carry no address (the wallet holds it) — skip the
    // write so an Apple Pay checkout can't blank a saved card address.
    if (channel !== 'applepay') {
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
    }

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
        brands: channel === 'applepay' ? 'APPLEPAY' : 'MADA VISA MASTER',
      },
      // The widget step shows a recap of who's paying (and "Edit" reopens
      // the form) — echo what was actually submitted so neither surface
      // falls back to the booking-derived defaults.
      values: echoValues(formData),
    });

    // A `processing` booking already holds a checkout. If it's still
    // inside the gateway's validity window, hand the SAME id back
    // (second tab, re-submit) instead of overwriting it; if it has aged
    // out, log the supersession so a late capture on the old checkout
    // can still be traced during reconciliation. The reuse must match
    // the requested channel — an Apple Pay request can never reuse a
    // card-entity checkout (or vice versa); a mismatch supersedes.
    if (booking.paymentStatus === 'processing' && booking.checkoutId) {
      const created = await latestPaymentEvent(booking.id, 'checkout_created');
      const fresh =
        created?.gatewayId === booking.checkoutId &&
        (created.resultCode ?? null) === channelTag &&
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

    const checkout = await prepareCheckout(
      {
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
        // Apple Pay: the wallet token carries no cardholder name, so the
        // gateway needs it on the checkout (blank holder → 100.100.401).
        cardHolder:
          channel === 'applepay' ? `${input.givenName} ${input.surname}`.trim() : undefined,
      },
      channel,
    );

    await db
      .update(bookings)
      .set({
        checkoutId: checkout.id,
        paymentStatus: 'processing',
        // This checkout is FRESH, so the supersession marker from any
        // earlier promo/credit change must clear with it (2026-07-28
        // fifth audit). Left set, the reconcile pass — which skips
        // superseded rows — excluded this booking permanently, so a
        // capture whose browser died before /pay/return would never
        // settle: guest charged, no receipt, seat released.
        checkoutSupersededAt: null,
        // A fresh checkout is a fresh attempt: clear the anomaly dedupe
        // too, or an anomaly recorded against the PREVIOUS checkout
        // silences the alert for a new one (2026-07-28 sixth audit).
        settleAnomalyAt: null,
        settleAnomalyKind: null,
      })
      .where(eq(bookings.id, booking.id));
    // The reuse window above keys off this event's timestamp, and the
    // channel tag tells settle/refund which entity to query.
    try {
      await recordPaymentEvent({
        bookingId: booking.id,
        type: 'checkout_created',
        amountSar: booking.totalAmount,
        gatewayId: checkout.id,
        resultCode: channelTag,
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
