'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay, hasHyperpayApplePay } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { checkoutViewerCanAccess } from '@/features/bookings/lib/access';
import { reportError } from '@/lib/log';
import { paymentDetailsSchema } from '@/features/payments/schemas';
import {
  getPaymentStatus,
  hyperpayBaseUrl,
  prepareCheckout,
} from '@/features/payments/lib/hyperpay';
import { classifyResult, isNoPaymentSession } from '@/features/payments/lib/hyperpay-core';
import { settleBooking } from '@/features/payments/settle';
import type { PaymentChannel, PaymentOutcome } from '@/features/payments/types';
import {
  countPaymentEventsSince,
  latestPaymentEvent,
  recordPaymentEvent,
} from '@/features/payments/ledger';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';
import { termsCarriedOver, termsCarriedOverTag } from '@/features/payments/lib/terms';
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
 * Per-booking ceiling on gateway checkouts prepared per hour. The payment
 * step now prepares a checkout on page load for eligible guests, so a
 * forwardable pay link must not become a way to spawn checkouts without
 * bound (reuse already returns the same id within the window above; this
 * caps what a channel-switching refresh storm can still create). Counts
 * CREATIONS only — every promo/wallet toggle retires the live checkout
 * and the reload prepares a fresh one, so a guest doing five ordinary
 * things in one sitting burns a handful; twenty is far beyond that.
 */
const CHECKOUT_CREATE_HOURLY_CAP = 20;

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
    // Signed proof from the pay link we emailed/WhatsApped, for the
    // browser that holds no last-booking cookie. Absent for the ordinary
    // in-session checkout, which authorizes on the cookie or the account.
    linkToken: z.string().max(64).optional(),
    // Payment method chosen before the widget mounts. Apple Pay lives on
    // its own gateway entity, so it needs its own checkout; a tampered or
    // stale 'applepay' submit degrades to 'card' below when the Apple Pay
    // entity isn't configured.
    method: z.enum(['card', 'applepay']).catch('card'),
    // 'on' when the payment step dispatched this itself on page load
    // (nothing left to type) rather than on a tap. An automatic request
    // must never retire a live checkout on another channel — that could
    // be the guest's own widget open in a second browser — so it is
    // handed the existing checkout as-is instead.
    auto: z
      .string()
      .optional()
      .transform((value) => value === 'on')
      .catch(false),
    // 'on' when a manual re-submit changed a 3DS2 field: the live
    // checkout was prepared with the OLD customer/billing values, so it
    // must be superseded, never reused (the recap would otherwise show
    // details the gateway never received).
    edited: z
      .string()
      .optional()
      .transform((value) => value === 'on')
      .catch(false),
    // Explicit clickwrap consent. The checkbox posts `on` only when
    // ticked; anything else normalizes to '' here and is gated BELOW,
    // once the booking row is loaded: a checkout without a fresh tick is
    // allowed only when the booking's own consent stamp names the
    // current document version (`termsCarriedOver`) — the booking form
    // is the enforceable clickwrap, and asking the same guest to tick
    // the same box twice thirty seconds apart was pure friction. A
    // tampered or scripted submit still cannot reach a checkout without
    // one of the two proofs.
    terms: z
      .string()
      .optional()
      .transform((value) => (value === 'on' ? 'on' : ''))
      .catch(''),
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
  /**
   * SRI hash for this checkout's widget script (from `integrity=true` on
   * checkout creation); null for pre-rollout checkouts reused from the DB.
   */
  integrity: string | null;
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
    linkToken: formValue(formData, 'token') || undefined,
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
    auto: formValue(formData, 'auto'),
    edited: formValue(formData, 'edited'),
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
        walletAppliedSar: true,
        paymentStatus: true,
        status: true,
        paymentDeadline: true,
        checkoutId: true,
        checkoutIntegrity: true,
        checkoutSupersededAt: true,
        contactPhone: true,
        settleAnomalyAt: true,
        termsAcceptedAt: true,
        termsVersion: true,
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
    // set their email — require ownership, the browser's booking cookie, or
    // the signed token from the pay link we sent this guest.
    if (!(await checkoutViewerCanAccess(input.reference, booking.guestId, input.linkToken))) {
      return { status: 'error', error: 'notFound', values: echoValues(formData) };
    }
    // Consent gate (see the schema note): a fresh tick, or the booking's
    // own current-version stamp. Checked right after authorization so a
    // missing consent is reported as the field error the form knows how
    // to render, before any money-state checks run.
    const termsFromBooking =
      input.terms !== 'on' && termsCarriedOver(booking, CURRENT_TERMS_VERSION);
    if (input.terms !== 'on' && !termsFromBooking) {
      return {
        status: 'error',
        error: 'validation',
        fields: { terms: 'required' },
        values: echoValues(formData),
      };
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
    const origin = await requestOrigin();
    const returnUrl = `${origin}/${input.locale}/book/${input.reference}/pay/return?slug=${encodeURIComponent(input.slug)}`;
    const brandsFor = (which: PaymentChannel) =>
      which === 'applepay' ? 'APPLEPAY' : 'MADA VISA MASTER';
    const ready = (
      checkoutId: string,
      integrity: string | null,
      forChannel: PaymentChannel = channel,
    ): CreateCheckoutState => ({
      status: 'ready',
      data: {
        checkoutId,
        integrity,
        scriptBaseUrl: hyperpayBaseUrl(),
        returnUrl,
        brands: brandsFor(forChannel),
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
    // Creation cap — see CHECKOUT_CREATE_HOURLY_CAP. Read up front so a
    // capped request leaves no ledger trace (the supersede write below
    // must not run for a request that then refuses to create).
    const recentCheckouts = await countPaymentEventsSince(
      booking.id,
      ['checkout_created'],
      new Date(Date.now() - 60 * 60_000),
    );
    const capped = recentCheckouts >= CHECKOUT_CREATE_HOURLY_CAP;
    const tooMany = (): CreateCheckoutState => {
      reportError(new Error('Checkout creation cap reached'), {
        surface: 'payment-create-checkout:cap',
        reference: input.reference,
        recentCheckouts,
      });
      return { status: 'error', error: 'tooManyAttempts', values: echoValues(formData) };
    };

    if (booking.paymentStatus === 'processing' && booking.checkoutId) {
      const created = await latestPaymentEvent(booking.id, 'checkout_created');
      const sameId = created?.gatewayId === booking.checkoutId;
      const existingTag = sameId ? (created.resultCode ?? null) : null;
      const existingChannel: PaymentChannel = existingTag === 'APPLEPAY' ? 'applepay' : 'card';
      const withinWindow =
        sameId && Date.now() - created.createdAt.getTime() < CHECKOUT_REUSE_MINUTES * 60_000;
      const fresh = withinWindow && existingTag === channelTag;

      // Ask the gateway about the live checkout BEFORE handing it back
      // or retiring it. A capture whose 3DS return never landed (tab
      // closed; webhook lagging) leaves the row `processing` with a
      // consumed id — rendering a widget on it dead-ends, and
      // superseding it would open a second charge. A captured checkout
      // goes to settle, never to a widget. `000.200.000` is what an
      // untouched checkout answers, so only a SUCCESS classification
      // is conclusive here; `unknown` (gateway unreachable) may still
      // reuse (same id, no new charge path) but never supersede.
      let existingOutcome: PaymentOutcome | 'unknown';
      let existingCode: string | null = null;
      try {
        const status = await getPaymentStatus(booking.checkoutId, existingChannel);
        existingCode = status.result.code;
        existingOutcome = classifyResult(existingCode);
      } catch (error) {
        reportError(error, {
          surface: 'payment-create-checkout:existingStatus',
          reference: input.reference,
        });
        existingOutcome = 'unknown';
      }
      if (existingOutcome === 'success') {
        const settled = await settleBooking(input.reference);
        const error =
          settled === 'success' || settled === 'already_settled'
            ? 'alreadyPaid'
            : settled === 'anomaly'
              ? 'underReview'
              : 'server';
        return { status: 'error', error, values: echoValues(formData) };
      }
      // A completed DECLINE whose 3DS return never landed leaves a
      // consumed checkout id: single-use at the gateway, so a widget on
      // it dead-ends. Let settle record the decline on its ordinary
      // path (failed flip, ledger, guest email — all idempotent), then
      // retire the id below instead of handing it back.
      const consumed =
        existingOutcome === 'rejected' &&
        existingCode !== null &&
        !isNoPaymentSession(existingCode);
      if (consumed) {
        try {
          await settleBooking(input.reference);
        } catch (error) {
          reportError(error, {
            surface: 'payment-create-checkout:settleDecline',
            reference: input.reference,
          });
        }
      }
      if (fresh && !consumed && !input.edited) {
        return ready(booking.checkoutId, booking.checkoutIntegrity);
      }
      // An automatic dispatch never retires a live checkout on another
      // channel — hand it back exactly as it is; the guest's own
      // "Choose a different payment method" tap is the deliberate path.
      if (withinWindow && input.auto && !consumed) {
        return ready(booking.checkoutId, booking.checkoutIntegrity, existingChannel);
      }
      if (existingOutcome === 'unknown') {
        return { status: 'error', error: 'server', values: echoValues(formData) };
      }
      if (capped) return tooMany();
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
    } else if (capped) {
      return tooMany();
    } else if (booking.checkoutId && !booking.checkoutSupersededAt) {
      // A leftover id on a non-processing row that nothing retired
      // (older data paths) — log it superseded before minting the next,
      // so every retired checkout has a ledger row to trace a late
      // capture back to.
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
        // Which evidence path admitted this checkout: a fresh tick on
        // the pay page (null, as before) or the booking form's stamp
        // carried over — an auditor can tell the two apart.
        resultCode: termsFromBooking ? termsCarriedOverTag(booking) : null,
      });
    } catch (error) {
      reportError(error, {
        surface: 'payment-create-checkout:consent',
        reference: input.reference,
      });
    }

    const checkout = await prepareCheckout(
      {
        merchantTransactionId: input.reference,
        amountSar: booking.totalAmount,
        customer: {
          email: input.email,
          givenName: input.givenName,
          surname: input.surname,
          // 3DS2 wants at least one phone; the booking's own contact
          // phone (E.164) is the freshest one we hold for this guest.
          mobile: booking.contactPhone ?? undefined,
        },
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
          channel === 'applepay'
            ? (input.surname === input.givenName
                ? input.givenName
                : `${input.givenName} ${input.surname}`
              ).trim()
            : undefined,
      },
      channel,
    );

    // Compare-and-swap on the checkout id read at the top: two requests
    // for the same booking (the pay link opened in the in-app browser
    // AND in Safari, both auto-preparing on load) must never each write
    // their own id, because settle only ever polls the id on the row —
    // a capture on the overwritten one would be invisible. The loser
    // re-reads the winner and hands that id back when it is the same
    // channel; its own checkout is logged superseded and simply expires
    // at the gateway.
    const claimed = await db
      .update(bookings)
      .set({
        checkoutId: checkout.id,
        checkoutIntegrity: checkout.integrity ?? null,
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
      .where(
        and(
          eq(bookings.id, booking.id),
          booking.checkoutId === null
            ? isNull(bookings.checkoutId)
            : eq(bookings.checkoutId, booking.checkoutId),
          // The checkout was prepared at THIS amount: a promo or credit
          // applied during the gateway round-trip changes the total
          // (keeping the id), and a widget priced at the old total would
          // settle into an amount anomaly. Same arbiter settle uses.
          eq(bookings.totalAmount, booking.totalAmount),
          eq(bookings.walletAppliedSar, booking.walletAppliedSar),
        ),
      )
      .returning({ id: bookings.id });
    if (claimed.length === 0) {
      try {
        await recordPaymentEvent({
          bookingId: booking.id,
          type: 'checkout_superseded',
          amountSar: booking.totalAmount,
          gatewayId: checkout.id,
        });
      } catch (error) {
        reportError(error, {
          surface: 'payment-create-checkout:ledger',
          reference: input.reference,
        });
      }
      const winner = await db.query.bookings.findFirst({
        where: eq(bookings.id, booking.id),
        columns: { checkoutId: true, checkoutIntegrity: true, paymentStatus: true },
      });
      // The winner writes its row first and its `checkout_created` a
      // beat later — read once, then once more after a short pause, so
      // the common interleaving doesn't read the PREVIOUS creation.
      let winnerCreated = await latestPaymentEvent(booking.id, 'checkout_created');
      if (winner?.checkoutId && winnerCreated?.gatewayId !== winner.checkoutId) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        winnerCreated = await latestPaymentEvent(booking.id, 'checkout_created');
      }
      if (
        winner?.checkoutId &&
        winner.paymentStatus === 'processing' &&
        winnerCreated?.gatewayId === winner.checkoutId
      ) {
        const winnerTag = winnerCreated.resultCode ?? null;
        if (winnerTag === channelTag) return ready(winner.checkoutId, winner.checkoutIntegrity);
        // Same rule as the reuse path: an automatic request takes the
        // live checkout as it is rather than surfacing an error nobody
        // asked for.
        if (input.auto) {
          return ready(
            winner.checkoutId,
            winner.checkoutIntegrity,
            winnerTag === 'APPLEPAY' ? 'applepay' : 'card',
          );
        }
      }
      // Different channel (or the row moved on): let the guest's next
      // tap take the ordinary reuse/supersede path.
      return { status: 'error', error: 'server', values: echoValues(formData) };
    }
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

    return ready(checkout.id, checkout.integrity ?? null);
  } catch (error) {
    reportError(error, { surface: 'payment-create-checkout', reference: input.reference });
    return { status: 'error', error: 'server', values: echoValues(formData) };
  }
}
