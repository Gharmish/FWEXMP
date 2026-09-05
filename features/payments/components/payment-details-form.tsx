'use client';

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createCheckout, type CreateCheckoutState } from '@/features/payments/actions';
import { trackAddPaymentInfo } from '@/lib/funnel-tracking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Price } from '@/components/ui/price';
import type { Locale } from '@/lib/i18n';
import { COUNTRIES, countryName } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { PaymentWidget } from './payment-widget';

declare global {
  interface Window {
    /** Safari-only. Presence (+ canMakePayments) gates the Apple Pay option. */
    ApplePaySession?: { canMakePayments(): boolean };
  }
}

/**
 * Apple Pay lockup for the method choice — the official Apple glyph +
 * "Pay" wordmark (same drawing as the footer's payment marks), inheriting
 * the button's current text colour so it reads correctly on both the
 * selected (black) and unselected (white) states of the control.
 */
function ApplePayLockup() {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5 leading-none">
      <svg viewBox="0 0 24 24" fill="currentColor" focusable={false} className="h-4 w-auto">
        <path d="M17.05 12.04c-.03-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.75 2.46 3 2.41 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.13.75 1.29-.02 2.11-1.18 2.9-2.34.91-1.34 1.29-2.64 1.31-2.71-.03-.01-2.51-.96-2.54-3.83zM14.7 5.36c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.63-2.79 1.43-.61.71-1.15 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34z" />
      </svg>
      <span className="text-base font-medium">Pay</span>
    </span>
  );
}

/**
 * Apple Pay device capability, hydration-safe: the server snapshot is
 * `false` (SSR can't know), the client snapshot reads ApplePaySession
 * once the store is subscribed — React re-renders with the real value
 * after hydration without a setState-in-effect. The capability never
 * changes within a page's lifetime, so the subscription is inert.
 */
const noopSubscribe = () => () => {};
function detectApplePay(): boolean {
  try {
    return Boolean(window.ApplePaySession?.canMakePayments());
  } catch {
    // Some engines expose ApplePaySession but throw off-https.
    return false;
  }
}
function useApplePayAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, detectApplePay, () => false);
}

export interface PaymentDetailsCopy {
  heading: string;
  /** Group heading for the guest's identity fields. */
  yourDetails: string;
  /** Expand action on the collapsed identity summary. */
  editDetails: string;
  billingAddressHeading: string;
  /** One-line reason the address is asked for (3-D Secure). */
  billingWhy: string;
  /** Suffix marking a non-required field, e.g. "optional". */
  optionalSuffix: string;
  givenName: string;
  surname: string;
  email: string;
  street1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  submit: string;
  pending: string;
  /** Per-field validation messages ("Enter your first name.", …). */
  invalid: Record<DetailField, string>;
  /** Form-level error messages keyed by error code. */
  errorValidation: string;
  errorServer: string;
  errorUnavailable: string;
  errorNotFound: string;
  errorAlreadyPaid: string;
  /** Hold released / expired before payment completed. */
  errorExpired: string;
  /** Request-to-book not yet accepted by the host (pay-after-approval). */
  errorNotApproved: string;
  errorUnderReview: string;
  /** Per-booking checkout-creation cap reached — wait, then retry. */
  errorTooManyAttempts: string;
  /**
   * Clickwrap consent line with inline links to the Terms, Privacy, and
   * Cancellation pages — built on the server (next-intl rich text) so the
   * link order stays grammatical in both English and Arabic.
   */
  termsLabel: ReactNode;
  /** Shown when the guest tries to pay without ticking the consent box. */
  termsRequired: string;
  /**
   * Passive re-affirmation used INSTEAD of the checkbox when the
   * booking's own consent stamp already covers this checkout
   * (`termsCarried`): "By continuing to payment, you agree to … — the
   * same terms you accepted when booking." Same three links.
   */
  termsCarriedLabel: ReactNode;
  /** Plain-text twin of `termsCarriedLabel` (no links) for the CTA's aria-describedby. */
  termsCarriedPlain: ReactNode;
  /** Widget-step variant of the carried line, worded around paying. */
  termsCarriedPayLabel: ReactNode;
  /** Widget-step consent line for guests who ticked the box on this page. */
  payConsentLabel: ReactNode;
  /**
   * Concrete cancellation terms for THIS booking, formatted server-side —
   * "Free cancellation until {deadline}…" or the inside-the-window
   * warning. Sits next to the consent line so the linked policy has a
   * plain-language anchor.
   */
  cancellationNote: string;
  payHeading: string;
  /** Widget pay-button label with the charged amount, e.g. "Pay SAR 480". */
  payAmount: string;
  widgetLoading: string;
  /** Shown if the HyperPay widget script fails to load. */
  widgetError: string;
  /** Retry action for the failed widget. */
  widgetRetry: string;
  /** Payment-method choice (shown only on Apple Pay-capable devices). */
  methodHeading: string;
  methodApplePay: string;
  methodCard: string;
  /** Back-link under the mounted widget to the details step. */
  changeMethod: string;
  /** "Paying with Apple Pay" / "Paying with card" — the recap line on the widget step. */
  payingWithApplePay: string;
  payingWithCard: string;
  /** Heading + status line while a checkout is prepared automatically. */
  preparingHeading: string;
  preparingBody: string;
}

type DetailField =
  | 'givenName'
  | 'surname'
  | 'email'
  | 'street1'
  | 'city'
  | 'state'
  | 'postcode'
  | 'country';

const ALL_DETAIL_FIELDS: readonly DetailField[] = [
  'givenName',
  'surname',
  'email',
  'street1',
  'city',
  'state',
  'postcode',
  'country',
];

interface TextField {
  name: Exclude<DetailField, 'country'>;
  autoComplete: string;
  type?: string;
  /** Mobile keyboard action key — "next" walks the form, "done" closes it. */
  enterKeyHint: 'next' | 'done';
}

/** Known from the booking — collapsed to a summary row when prefilled. */
const IDENTITY_FIELDS: readonly TextField[] = [
  { name: 'givenName', autoComplete: 'given-name', enterKeyHint: 'next' },
  { name: 'surname', autoComplete: 'family-name', enterKeyHint: 'next' },
  { name: 'email', autoComplete: 'email', type: 'email', enterKeyHint: 'next' },
];

/** 3DS2-mandated address fields (state is optional per the OPPWA guide). */
const ADDRESS_FIELDS: readonly TextField[] = [
  { name: 'street1', autoComplete: 'address-line1', enterKeyHint: 'next' },
  { name: 'city', autoComplete: 'address-level2', enterKeyHint: 'next' },
  { name: 'postcode', autoComplete: 'postal-code', enterKeyHint: 'next' },
  { name: 'state', autoComplete: 'address-level1', enterKeyHint: 'done' },
];

/**
 * Auto-continue failures the pay PAGE already handles by redirecting
 * (paid, not approved, hold lapsed): re-render the page and let its
 * guards land the guest on the right confirmation state instead of
 * showing a form nobody can use.
 */
const TERMINAL_CHECKOUT_ERRORS = new Set(['alreadyPaid', 'notApproved', 'expired']);

const initialState: CreateCheckoutState = { status: 'idle' };

/** Shared classes for the text-link actions (Edit, change method): 44px hit area. */
const linkActionClassName =
  'inline-flex min-h-11 shrink-0 items-center text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70';

function SubmitButton({
  copy,
  totalSar,
  locale,
  isAccepted,
  onBlocked,
  describedBy,
}: {
  copy: PaymentDetailsCopy;
  /** Charged total — the CTA carries the amount (the summary card is screens away). */
  totalSar: number;
  locale: Locale;
  /** Reads the (uncontrolled) consent checkbox at click time. */
  isAccepted: () => boolean;
  /** Called when submit is attempted without consent — cancels the submit. */
  onBlocked: () => void;
  /** The passive consent line, so the button's consequence is announced with it. */
  describedBy?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className="w-full"
      pending={pending}
      aria-describedby={describedBy}
      onClick={(event) => {
        // Keep the button reachable (focusable, not `disabled`) for
        // accessibility, but stop the submit until the box is ticked and
        // surface the reason instead of failing silently on the server.
        if (!isAccepted()) {
          event.preventDefault();
          onBlocked();
        }
      }}
    >
      {pending ? (
        copy.pending
      ) : (
        <>
          {copy.submit}
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <Price amount={totalSar} locale={locale} />
        </>
      )}
    </Button>
  );
}

/**
 * Placeholder shaped like the widget COPYandPAY renders (four field rows
 * + pay button) — the same stand-in the widget itself shows while its
 * script loads, so the auto-prepared step swaps in without a jump.
 */
function PreparingPayment({
  copy,
  headingRef,
}: {
  copy: PaymentDetailsCopy;
  /** Focus target when the swap took a focused control away from the guest. */
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section aria-busy="true" className="flex flex-col gap-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-medium tracking-[-0.025em]"
      >
        {copy.preparingHeading}
      </h2>
      {/* Announced through the form's persistent live region, not here:
          a status node that arrives with its text already inside is
          skipped by most screen readers. */}
      <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.preparingBody}</p>
      <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
      <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
      <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
      <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
      <div className="bg-sarat-black/5 rounded-button h-13 w-full animate-pulse motion-reduce:animate-none" />
    </section>
  );
}

/**
 * Server-derived eligibility for preparing the checkout on page load —
 * only ever non-null when the identity fields are complete AND the
 * booking's consent stamp carries over, i.e. there is nothing left for
 * the guest to type. `cardReady` = a stored billing address is complete
 * (a card checkout can be prepared blind); `applePay` = the Apple Pay
 * entity is configured (the DEVICE check happens client-side).
 */
export interface PaymentAutoContinue {
  applePay: boolean;
  cardReady: boolean;
}

export interface PaymentDetailsFormProps {
  reference: string;
  locale: Locale;
  slug: string;
  /**
   * Signed token from the pay link we sent this guest, forwarded to the
   * action so a cookieless browser (WhatsApp's in-app one, or a second
   * device) can still finish paying. Undefined for the in-session flow.
   */
  linkToken?: string;

  /** Charged total in SAR — shown on the submit CTA. */
  totalSar: number;
  copy: PaymentDetailsCopy;
  /**
   * Server flag: the dedicated Apple Pay gateway entity is configured.
   * The Apple Pay option renders only when this AND the device support
   * it (ApplePaySession) hold.
   */
  applePayEnabled?: boolean;
  /**
   * Server-derived prefill (e.g. the booking's guest name). A failed-submit
   * server echo (`state.values`) always wins over these so the user never
   * loses what they typed.
   */
  defaults?: Partial<Record<DetailField, string>>;
  /**
   * The booking's own clickwrap (booking form) already covers this
   * checkout — computed on the server from the booking row, never from
   * anything the client could claim. When true the consent checkbox is
   * replaced by a passive re-affirmation line; the server independently
   * re-derives the same fact before accepting a tick-less submit.
   */
  termsCarried?: boolean;
  /** See {@link PaymentAutoContinue}. Null/undefined = the guest must fill something first. */
  autoContinue?: PaymentAutoContinue | null;
}

export function PaymentDetailsForm({
  reference,
  locale,
  slug,
  linkToken,
  totalSar,
  copy,
  applePayEnabled = false,
  defaults,
  termsCarried = false,
  autoContinue = null,
}: PaymentDetailsFormProps) {
  const [actionState, formAction] = useActionState(createCheckout, initialState);
  // The auto path calls the action directly (see the effect below) so a
  // transport failure on page load degrades to the ordinary form instead
  // of throwing into the route's error boundary; its result lives here
  // and wins until the guest submits manually.
  const [autoResult, setAutoResult] = useState<CreateCheckoutState | null>(null);
  const state = autoResult ?? actionState;
  const values = state.values ?? {};
  const errorId = useId();
  const termsErrorId = useId();
  const consentNoteId = useId();
  const router = useRouter();
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [consentBlocked, setConsentBlocked] = useState(false);
  // Uncontrolled (like the address fields) so the tick survives React 19's
  // post-action form reset: its checked state is read from the DOM at submit
  // and re-defaulted from the server echo (`values.terms`) on a failed submit.
  const termsRef = useRef<HTMLInputElement>(null);

  // The method control renders only when the entity is configured AND
  // the device can pay. State holds just the explicit user choice; the
  // default derives from availability, so Apple Pay leads on capable
  // devices — mirroring the old layout where its button sat on top.
  const deviceCanApplePay = useApplePayAvailable();
  const applePayAvailable = applePayEnabled && deviceCanApplePay;
  const [chosenMethod, setChosenMethod] = useState<'card' | 'applepay' | null>(null);
  const method = chosenMethod ?? (applePayAvailable ? 'applepay' : 'card');

  // The consent checkbox is skipped only while BOTH hold: the server said
  // the booking's stamp carries over AND it has not since answered
  // `fields.terms` (the documents were re-versioned between render and
  // submit, or a legacy row without a stamp) — in which case the real
  // checkbox comes back, because a passive line plus a "tick the box"
  // error with no box would be a dead end.
  // Sticky: once the server has demanded a tick, the checkbox stays and
  // every consent line on this page reads as a fresh acceptance — even
  // after the re-submit succeeds and `state.fields` clears (the ledger
  // row for that checkout records a tick, and the screen must agree).
  // Guarded adjust-during-render, never an effect.
  const [tickRequired, setTickRequired] = useState(false);
  if (state.fields?.terms && !tickRequired) setTickRequired(true);
  const showTermsCheckbox = !termsCarried || tickRequired;
  // Show the consent error if the guest tried to submit without ticking
  // (client guard) or if a JS-less/tampered submit was rejected server-side.
  const termsError = consentBlocked || Boolean(state.fields?.terms);

  // Full, localized country list (Israel already excluded upstream in
  // lib/phone), sorted by display name in the active locale. Codes are the
  // stable alpha-2 the schema validates; names are presentation only.
  const countryOptions = useMemo(
    () =>
      [...COUNTRIES]
        .map((c) => ({ iso: c.iso, name: countryName(c.iso, locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale],
  );

  // Echoed submit values always win over the booking-derived prefill.
  const fieldValue = (name: DetailField) => values[name] ?? defaults?.[name];
  // A single-token booking name is prefilled into BOTH name fields (the
  // gateway wants a non-empty surname); the recaps must not read it
  // back as "Ahmed Ahmed".
  const displayName = () => {
    const given = fieldValue('givenName') ?? '';
    const surname = fieldValue('surname') ?? '';
    return !surname || surname === given ? given : `${given} ${surname}`;
  };

  // Backing out of a mounted widget (checkout-audit P1: the widget step
  // must not vaporize what the guest agreed to). "Edit" marks the current
  // checkout dismissed and the details form re-renders — prefilled from
  // the success echo — without a page reload. Re-submitting clears the
  // dismissal BEFORE the action runs: a still-valid checkout is reused
  // server-side (same id comes back), so the dismissal can't key off the
  // id changing.
  const [dismissedCheckoutId, setDismissedCheckoutId] = useState<string | null>(null);
  // Set by the auto path right before it dispatches, so the step-swap
  // focus effect below knows this transition was not user-initiated and
  // must not move focus. Cleared by every manual submit.
  const autoTransition = useRef(false);
  const submitAction = (formData: FormData) => {
    autoTransition.current = false;
    // A re-submit that CHANGED a 3DS2 field must not silently reuse the
    // checkout prepared with the old ones — the recap would show values
    // the gateway never received. Flag it so the server supersedes.
    // Apple Pay posts no address fields, so only identity counts there.
    if (state.status === 'ready') {
      const outgoingMethod = String(formData.get('method') ?? 'card');
      const compared =
        outgoingMethod === 'applepay' ? IDENTITY_FIELDS.map((f) => f.name) : ALL_DETAIL_FIELDS;
      const edited = compared.some(
        (field) => String(formData.get(field) ?? '') !== (state.values?.[field] ?? ''),
      );
      if (edited) formData.set('edited', 'on');
    }
    setAutoResult(null);
    setDismissedCheckoutId(null);
    formAction(formData);
  };
  const activeCheckout =
    state.status === 'ready' && state.data && state.data.checkoutId !== dismissedCheckoutId
      ? state.data
      : null;

  // Auto-continue: when the server found nothing left to type, prepare
  // the checkout on load so the widget (Apple Pay button, or the card
  // form against a stored address) is the first thing the guest sees —
  // the "Continue to payment" tap existed only to post fields we already
  // hold. Once per mount (ref guard; StrictMode's double effect keeps
  // refs), only from a visible document (never a prerender or a
  // background tab), and always as a CLIENT effect: the RSC render is a
  // GET and stays side-effect free. `Edit` / "Choose a different method"
  // never re-arm it, and a failure falls back to the ordinary form.
  const [autoPending, startAuto] = useTransition();
  const autoRan = useRef(false);
  const focusWasInForm = useRef(false);
  const preparingHeadingRef = useRef<HTMLHeadingElement>(null);
  // The one stable wrapper every step renders into — scopes the focus
  // check to this component and keeps the live region on one fiber.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoContinue || autoRan.current || state.status !== 'idle') return;
    const fire = () => {
      if (autoRan.current) return;
      // Apple Pay capability is read straight from the window here: the
      // hook's client snapshot only lands in the post-hydration
      // re-render, i.e. after this first effect has already run.
      let mode: 'applepay' | 'card' | null = null;
      if (autoContinue.applePay && detectApplePay()) mode = 'applepay';
      if (!mode && autoContinue.cardReady) mode = 'card';
      if (!mode) return;
      autoRan.current = true;
      autoTransition.current = true;
      // If the guest had already tabbed/tapped into the form that is
      // about to be replaced, keep them oriented: land on the preparing
      // heading now, and on the pay heading once the widget mounts.
      // Otherwise never move focus for an automatic swap.
      focusWasInForm.current = rootRef.current?.contains(document.activeElement) ?? false;
      if (focusWasInForm.current) {
        requestAnimationFrame(() => preparingHeadingRef.current?.focus());
      }
      const fd = new FormData();
      fd.set('reference', reference);
      if (linkToken) fd.set('token', linkToken);
      fd.set('locale', locale);
      fd.set('slug', slug);
      for (const field of ALL_DETAIL_FIELDS) {
        fd.set(field, defaults?.[field] ?? (field === 'country' ? 'SA' : ''));
      }
      fd.set('method', mode);
      // Tells the action this dispatch was nobody's decision: a live
      // checkout on another channel must be handed back as-is, never
      // superseded (see createCheckout).
      fd.set('auto', 'on');
      // No `terms` on purpose: the server accepts a tick-less submit only
      // on the booking's own stamp and tags the ledger row as carried
      // over — a synthesized "on" here would be false evidence.
      startAuto(async () => {
        try {
          setAutoResult(await createCheckout(initialState, fd));
        } catch {
          // Transport failure (connection dropped, in-app browser
          // backgrounded mid-request): back to the ordinary form.
          setAutoResult({ status: 'error', error: 'server' });
        }
      });
    };
    const visible = () =>
      document.visibilityState === 'visible' &&
      !(document as Document & { prerendering?: boolean }).prerendering;
    if (visible()) {
      fire();
      return;
    }
    const onVisible = () => {
      if (visible()) fire();
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('prerenderingchange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('prerenderingchange', onVisible);
    };
  }, [autoContinue, state.status, defaults, reference, linkToken, locale, slug]);

  // An auto attempt that hit a state the page itself redirects on
  // (already paid, not yet approved, hold lapsed) re-renders the page so
  // its guards take the guest to the right confirmation copy, instead of
  // leaving them on a form that can only fail again. Once.
  const refreshed = useRef(false);
  useEffect(() => {
    if (state.status !== 'error' || !autoRan.current || refreshed.current) return;
    if (!TERMINAL_CHECKOUT_ERRORS.has(state.error ?? '')) return;
    refreshed.current = true;
    router.refresh();
  }, [state, router]);

  // The card-ready case is known on the server, so the very first paint
  // (SSR and hydration alike — `state` is idle on both sides) is the
  // preparing placeholder rather than a form that would vanish a moment
  // later. Apple Pay eligibility is device-only, so that path shows the
  // form until the effect above resolves it.
  const showPreparing =
    activeCheckout === null &&
    (autoPending || (Boolean(autoContinue?.cardReady) && state.status === 'idle'));

  // Funnel `add_payment_info`: fired when the COPYandPAY script has
  // rendered its fields — the guest can now enter card / Apple Pay
  // details. On the widget's onReady rather than on checkout creation,
  // so an auto-prepared checkout does not count until it has actually
  // been shown. Deduped per booking within the browser session (same
  // pattern as checkout-tracking.tsx) so edit-details round-trips and
  // re-prepared checkouts don't inflate the step. Silent no-op without
  // "Accept all" consent.
  const handleWidgetReady = () => {
    const storageKey = `gharmish_payinfo_${reference}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Storage blocked (private mode): fire anyway — repeats are benign.
    }
    trackAddPaymentInfo({ slug, reference, amountSar: totalSar });
  };

  // A bfcache restore (Back from the 3DS page or the confirmation) would
  // resurrect a widget on a checkout that has already been consumed.
  // Reload instead: the page's guards then land a paid booking on its
  // confirmation, and an unpaid one gets a fresh (or reused) checkout.
  const activeCheckoutId = activeCheckout?.checkoutId ?? null;
  useEffect(() => {
    if (!activeCheckoutId) return;
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [activeCheckoutId]);

  // Focus follows the step swap: the widget replaces the details form in
  // place (and Edit swaps it back), so without this keyboard/SR users are
  // left on a control that no longer exists. Only USER-INITIATED
  // transitions move focus — never the first render, and never the
  // auto-prepared swap, which would yank a screen-reader user away from
  // the heading they were reading seconds after the page loaded (the
  // preparing status line announces that one instead).
  const payHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const isWidgetStep = Boolean(activeCheckout);
  const prevStepRef = useRef(isWidgetStep);
  useEffect(() => {
    if (prevStepRef.current === isWidgetStep) return;
    prevStepRef.current = isWidgetStep;
    if (autoTransition.current) {
      autoTransition.current = false;
      // Only when the automatic swap took a focused control away.
      if (focusWasInForm.current && isWidgetStep) payHeadingRef.current?.focus();
      return;
    }
    (isWidgetStep ? payHeadingRef : detailsHeadingRef).current?.focus();
  }, [isWidgetStep]);

  // One persistent polite region (same fiber across every step) whose
  // TEXT changes — that is what screen readers announce; a status node
  // that mounts with its text already inside is not.
  const liveText = autoPending ? copy.preparingBody : activeCheckout ? copy.payHeading : '';
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {liveText}
    </p>
  );

  let body: ReactNode;
  if (activeCheckout) {
    const activeIsApplePay = activeCheckout.brands === 'APPLEPAY';
    body = (
      <div className="flex flex-col gap-4">
        <h2
          ref={payHeadingRef}
          tabIndex={-1}
          className="font-display text-2xl font-medium tracking-[-0.025em]"
        >
          {copy.payHeading}
        </h2>
        {/* Who's paying, still on screen at the moment of payment — the
            same recap card pattern as the details step — and HOW, in
            words: when the checkout was prepared automatically the guest
            never chose a method, so the Apple Pay button (or card form)
            must explain itself. */}
        <div className="border-sarat-black/8 rounded-input flex items-start justify-between gap-4 [border-width:0.5px] px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="font-medium">{displayName()}</span>
            <span dir="ltr" className="text-sarat-black-600 truncate">
              {fieldValue('email')}
            </span>
            {!activeIsApplePay && (
              <span className="text-sarat-black-600 truncate">
                {[
                  fieldValue('street1'),
                  fieldValue('city'),
                  countryName(fieldValue('country') ?? 'SA', locale),
                ]
                  .filter(Boolean)
                  .join(locale === 'ar' ? '، ' : ', ')}
              </span>
            )}
            <span className="text-sarat-black-600">
              {activeIsApplePay ? copy.payingWithApplePay : copy.payingWithCard}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedCheckoutId(activeCheckout.checkoutId)}
            className={linkActionClassName}
          >
            {copy.editDetails}
          </button>
        </div>
        {/* The consent line at the moment money leaves — with the details
            step now often skipped, this is the one place the guest is
            guaranteed to see it before paying. The per-booking
            cancellation deadline stays beside it as the plain-language
            anchor for the linked policy. */}
        <div className="flex flex-col gap-2">
          <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.cancellationNote}</p>
          <p className="text-sm leading-relaxed">
            {termsCarried && !tickRequired ? copy.termsCarriedPayLabel : copy.payConsentLabel}
          </p>
        </div>
        <PaymentWidget
          checkout={activeCheckout}
          locale={locale}
          payLabel={copy.payAmount}
          loadingLabel={copy.widgetLoading}
          errorLabel={copy.widgetError}
          retryLabel={copy.widgetRetry}
          onReady={handleWidgetReady}
        />
        {applePayAvailable && (
          // Back out of the chosen method (e.g. Apple Pay sheet won't
          // open): switch to the OTHER method and reopen the details
          // step on it — with two methods, "different" is unambiguous,
          // and landing on the same selection again cost a second tap.
          <button
            type="button"
            onClick={() => {
              setChosenMethod(activeIsApplePay ? 'card' : 'applepay');
              setDismissedCheckoutId(activeCheckout.checkoutId);
            }}
            className={cn(linkActionClassName, 'self-start')}
          >
            {copy.changeMethod}
          </button>
        )}
      </div>
    );
  } else if (showPreparing) {
    body = <PreparingPayment copy={copy} headingRef={preparingHeadingRef} />;
  } else {
    const formError =
      state.status === 'error'
        ? {
            validation: copy.errorValidation,
            server: copy.errorServer,
            unavailable: copy.errorUnavailable,
            notFound: copy.errorNotFound,
            alreadyPaid: copy.errorAlreadyPaid,
            expired: copy.errorExpired,
            notApproved: copy.errorNotApproved,
            underReview: copy.errorUnderReview,
            tooManyAttempts: copy.errorTooManyAttempts,
          }[state.error ?? 'server']
        : undefined;

    // The identity block collapses to a summary row only when the booking
    // supplied all three values and none of them failed validation — a
    // rejected value must never hide behind a summary.
    const identityHasError = IDENTITY_FIELDS.some((f) => Boolean(state.fields?.[f.name]));
    const identityComplete = IDENTITY_FIELDS.every((f) => Boolean(fieldValue(f.name)));
    const identityCollapsed = identityComplete && !identityHasError && !editingIdentity;

    // The billing address collapses on the same rule: a stored address from a
    // previous checkout is confirmed, not retyped. `state` is optional so it
    // isn't part of completeness; `country` always has a value (defaults to
    // SA). Any rejected address field forces the block open.
    const addressHasError =
      ADDRESS_FIELDS.some((f) => Boolean(state.fields?.[f.name])) || Boolean(state.fields?.country);
    const addressComplete = Boolean(
      fieldValue('street1') && fieldValue('city') && fieldValue('postcode'),
    );
    const addressCollapsed = addressComplete && !addressHasError && !editingAddress;

    const renderTextField = (field: TextField, opts?: { optional?: boolean; span2?: boolean }) => {
      const hasError = Boolean(state.fields?.[field.name]);
      // aria-describedby ties the message to the input (the booking form's
      // pattern) — aria-invalid alone announces "invalid" without saying why.
      const fieldErrorId = `pay-${field.name}-error`;
      return (
        <div key={field.name} className={cn('flex flex-col gap-2', opts?.span2 && 'sm:col-span-2')}>
          <label htmlFor={`pay-${field.name}`} className="text-sm font-medium">
            {copy[field.name]}
            {opts?.optional && (
              <span className="text-sarat-black-600 font-normal"> ({copy.optionalSuffix})</span>
            )}
          </label>
          <Input
            id={`pay-${field.name}`}
            name={field.name}
            type={field.type ?? 'text'}
            autoComplete={field.autoComplete}
            enterKeyHint={field.enterKeyHint}
            required={!opts?.optional}
            dir={field.name === 'email' ? 'ltr' : undefined}
            defaultValue={fieldValue(field.name)}
            aria-invalid={hasError ? true : undefined}
            aria-describedby={hasError ? fieldErrorId : undefined}
          />
          {hasError && (
            <p id={fieldErrorId} className="text-al-qatt-red-800 text-sm">
              {copy.invalid[field.name]}
            </p>
          )}
        </div>
      );
    };

    body = (
      <form action={submitAction} noValidate className="flex flex-col gap-6">
        <input type="hidden" name="reference" value={reference} />
        {linkToken && <input type="hidden" name="token" value={linkToken} />}
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="slug" value={slug} />

        <h2
          ref={detailsHeadingRef}
          tabIndex={-1}
          className="font-display text-2xl font-medium tracking-[-0.025em]"
        >
          {copy.heading}
        </h2>

        <section className="flex flex-col gap-3" aria-label={copy.yourDetails}>
          <h3 className="text-base font-medium">{copy.yourDetails}</h3>
          {identityCollapsed ? (
            <div className="border-sarat-black/8 rounded-input flex items-center justify-between gap-4 [border-width:0.5px] px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <span className="font-medium">{displayName()}</span>
                <span dir="ltr" className="text-sarat-black-600 truncate">
                  {fieldValue('email')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingIdentity(true)}
                className={linkActionClassName}
              >
                {copy.editDetails}
              </button>
              {IDENTITY_FIELDS.map((f) => (
                <input key={f.name} type="hidden" name={f.name} value={fieldValue(f.name) ?? ''} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {renderTextField(IDENTITY_FIELDS[0])}
              {renderTextField(IDENTITY_FIELDS[1])}
              {renderTextField(IDENTITY_FIELDS[2], { span2: true })}
            </div>
          )}
        </section>

        {applePayAvailable && (
          <section className="flex flex-col gap-3" aria-label={copy.methodHeading}>
            <h3 className="text-base font-medium">{copy.methodHeading}</h3>
            {/* Plain toggle buttons with aria-pressed — NOT radios: the
              buttons don't implement the radio keyboard contract (arrow
              keys, roving tabindex), so claiming the role would promise
              interactions that don't exist. */}
            <div
              role="group"
              aria-label={copy.methodHeading}
              className="border-sarat-black/8 rounded-input grid grid-cols-2 gap-1 [border-width:0.5px] p-1"
            >
              <button
                type="button"
                aria-pressed={method === 'applepay'}
                aria-label={copy.methodApplePay}
                onClick={() => setChosenMethod('applepay')}
                className={cn(
                  'rounded-input flex min-h-11 items-center justify-center transition-colors duration-200',
                  method === 'applepay'
                    ? 'bg-sarat-black text-white'
                    : 'text-sarat-black-600 hover:text-sarat-black',
                )}
              >
                <ApplePayLockup />
              </button>
              <button
                type="button"
                aria-pressed={method === 'card'}
                onClick={() => setChosenMethod('card')}
                className={cn(
                  'rounded-input min-h-11 text-sm font-medium transition-colors duration-200',
                  method === 'card'
                    ? 'bg-sarat-black text-white'
                    : 'text-sarat-black-600 hover:text-sarat-black',
                )}
              >
                {copy.methodCard}
              </button>
            </div>
          </section>
        )}

        {/* Apple Pay needs no billing address — the wallet carries it and the
          gateway accepts an address-less checkout on the Apple Pay entity.
          The section (and its inputs) unmounts entirely so nothing stale
          posts; the server schema only mandates the address for cards. */}
        {method !== 'applepay' && (
          <section className="flex flex-col gap-3" aria-label={copy.billingAddressHeading}>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-medium">{copy.billingAddressHeading}</h3>
              <p className="text-sarat-black-600 text-sm">{copy.billingWhy}</p>
            </div>
            {addressCollapsed ? (
              <div className="border-sarat-black/8 rounded-input flex items-center justify-between gap-4 [border-width:0.5px] px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="font-medium">{fieldValue('street1')}</span>
                  <span className="text-sarat-black-600 truncate">
                    {[fieldValue('city'), fieldValue('postcode'), fieldValue('state')]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  <span className="text-sarat-black-600 truncate">
                    {countryName(fieldValue('country') ?? 'SA', locale)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAddress(true)}
                  className={linkActionClassName}
                >
                  {copy.editDetails}
                </button>
                {ADDRESS_FIELDS.map((f) => (
                  <input
                    key={f.name}
                    type="hidden"
                    name={f.name}
                    value={fieldValue(f.name) ?? ''}
                  />
                ))}
                <input type="hidden" name="country" value={fieldValue('country') ?? 'SA'} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {renderTextField(ADDRESS_FIELDS[0], { span2: true })}
                {renderTextField(ADDRESS_FIELDS[1])}
                {renderTextField(ADDRESS_FIELDS[2])}
                {renderTextField(ADDRESS_FIELDS[3], { optional: true })}

                <div className="flex flex-col gap-2">
                  <label htmlFor="pay-country" className="text-sm font-medium">
                    {copy.country}
                  </label>
                  <select
                    id="pay-country"
                    name="country"
                    autoComplete="country"
                    required
                    defaultValue={values.country ?? defaults?.country ?? 'SA'}
                    aria-invalid={state.fields?.country ? true : undefined}
                    aria-describedby={state.fields?.country ? 'pay-country-error' : undefined}
                    className={cn(
                      'rounded-input border-sarat-black/20 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-4 text-base',
                      'aria-invalid:border-al-qatt-red',
                    )}
                  >
                    {countryOptions.map((c) => (
                      // The localized name can differ between server and browser ICU
                      // builds; the value (alpha-2) is stable, so suppress the warning.
                      <option key={c.iso} value={c.iso} suppressHydrationWarning>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {state.fields?.country && (
                    <p id="pay-country-error" className="text-al-qatt-red-800 text-sm">
                      {copy.invalid.country}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
        <input type="hidden" name="method" value={applePayAvailable ? method : 'card'} />

        {formError && (
          <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {/* The concrete terms for THIS booking, right where the guest
            consents to the linked cancellation policy. */}
          <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.cancellationNote}</p>
          {showTermsCheckbox ? (
            <>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  ref={termsRef}
                  type="checkbox"
                  name="terms"
                  defaultChecked={values.terms === 'on'}
                  onChange={(event) => {
                    if (event.target.checked) setConsentBlocked(false);
                  }}
                  aria-invalid={termsError ? true : undefined}
                  aria-describedby={termsError ? termsErrorId : undefined}
                  // Native checkboxes ignore border utilities — the error state
                  // is a ring, so the fix-it target is visible, not just the
                  // message below (WCAG 3.3.1: identify the errored control).
                  className="border-sarat-black/40 accent-sarat-black aria-invalid:ring-al-qatt-red mt-0.5 size-5 shrink-0 aria-invalid:ring-2 aria-invalid:ring-offset-1"
                />
                <span className="text-sm leading-relaxed">{copy.termsLabel}</span>
              </label>
              {termsError && (
                <p id={termsErrorId} role="alert" className="text-al-qatt-red-800 ps-8 text-sm">
                  {copy.termsRequired}
                </p>
              )}
            </>
          ) : (
            // The booking form's clickwrap already covers this checkout:
            // a visible re-affirmation (never sr-only) tied to the CTA via
            // aria-describedby, so the button's consequence is announced
            // with it. No hidden `terms` input — the server relies on the
            // booking row, not on anything posted here.
            <>
              <p className="text-sm leading-relaxed">{copy.termsCarriedLabel}</p>
              {/* `hidden`, not sr-only: a referenced-but-hidden node still
                feeds the button's accessible description without also
                being read a second time in linear order. */}
              <p id={consentNoteId} hidden>
                {copy.termsCarriedPlain}
              </p>
            </>
          )}
        </div>

        <SubmitButton
          copy={copy}
          totalSar={totalSar}
          locale={locale}
          isAccepted={() => (showTermsCheckbox ? (termsRef.current?.checked ?? false) : true)}
          onBlocked={() => {
            setConsentBlocked(true);
            termsRef.current?.focus();
          }}
          describedBy={showTermsCheckbox ? undefined : consentNoteId}
        />
      </form>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {liveRegion}
      {body}
    </div>
  );
}
