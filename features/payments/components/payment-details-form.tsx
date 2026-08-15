'use client';

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
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
  /**
   * Clickwrap consent line with inline links to the Terms, Privacy, and
   * Cancellation pages — built on the server (next-intl rich text) so the
   * link order stays grammatical in both English and Arabic.
   */
  termsLabel: ReactNode;
  /** Shown when the guest tries to pay without ticking the consent box. */
  termsRequired: string;
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

interface TextField {
  name: Exclude<DetailField, 'country'>;
  autoComplete: string;
  type?: string;
}

/** Known from the booking — collapsed to a summary row when prefilled. */
const IDENTITY_FIELDS: readonly TextField[] = [
  { name: 'givenName', autoComplete: 'given-name' },
  { name: 'surname', autoComplete: 'family-name' },
  { name: 'email', autoComplete: 'email', type: 'email' },
];

/** 3DS2-mandated address fields (state is optional per the OPPWA guide). */
const ADDRESS_FIELDS: readonly TextField[] = [
  { name: 'street1', autoComplete: 'address-line1' },
  { name: 'city', autoComplete: 'address-level2' },
  { name: 'postcode', autoComplete: 'postal-code' },
  { name: 'state', autoComplete: 'address-level1' },
];

const initialState: CreateCheckoutState = { status: 'idle' };

function SubmitButton({
  copy,
  totalSar,
  locale,
  isAccepted,
  onBlocked,
}: {
  copy: PaymentDetailsCopy;
  /** Charged total — the CTA carries the amount (the summary card is screens away). */
  totalSar: number;
  locale: Locale;
  /** Reads the (uncontrolled) consent checkbox at click time. */
  isAccepted: () => boolean;
  /** Called when submit is attempted without consent — cancels the submit. */
  onBlocked: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className="w-full"
      pending={pending}
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
}: PaymentDetailsFormProps) {
  const [state, formAction] = useActionState(createCheckout, initialState);
  const values = state.values ?? {};
  const errorId = useId();
  const termsErrorId = useId();
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

  // Backing out of a mounted widget (checkout-audit P1: the widget step
  // must not vaporize what the guest agreed to). "Edit" marks the current
  // checkout dismissed and the details form re-renders — prefilled from
  // the success echo — without a page reload. Re-submitting clears the
  // dismissal BEFORE the action runs: a still-valid checkout is reused
  // server-side (same id comes back), so the dismissal can't key off the
  // id changing.
  const [dismissedCheckoutId, setDismissedCheckoutId] = useState<string | null>(null);
  const submitAction = (formData: FormData) => {
    setDismissedCheckoutId(null);
    formAction(formData);
  };
  const activeCheckout =
    state.status === 'ready' && state.data && state.data.checkoutId !== dismissedCheckoutId
      ? state.data
      : null;

  // Funnel `add_payment_info`: the OPPWA widget is about to mount — the
  // guest is now entering card / Apple Pay details. Deduped per booking
  // within the browser session (same pattern as checkout-tracking.tsx)
  // so edit-details round-trips and re-prepared checkouts don't inflate
  // the step. Silent no-op without "Accept all" consent.
  const activeCheckoutId = activeCheckout?.checkoutId ?? null;
  useEffect(() => {
    if (!activeCheckoutId) return;
    const storageKey = `gharmish_payinfo_${reference}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Storage blocked (private mode): fire anyway — repeats are benign.
    }
    trackAddPaymentInfo({ slug, reference, amountSar: totalSar });
  }, [activeCheckoutId, reference, slug, totalSar]);

  if (activeCheckout) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{copy.payHeading}</h2>
        {/* Who's paying, still on screen at the moment of payment — the
            same recap card pattern as the details step. */}
        <div className="border-sarat-black/8 rounded-input flex items-start justify-between gap-4 [border-width:0.5px] px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="font-medium">
              {fieldValue('givenName')} {fieldValue('surname')}
            </span>
            <span dir="ltr" className="text-sarat-black-600 truncate">
              {fieldValue('email')}
            </span>
            <span className="text-sarat-black-600 truncate">
              {[
                fieldValue('street1'),
                fieldValue('city'),
                countryName(fieldValue('country') ?? 'SA', locale),
              ]
                .filter(Boolean)
                .join(locale === 'ar' ? '، ' : ', ')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedCheckoutId(activeCheckout.checkoutId)}
            className="shrink-0 text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
          >
            {copy.editDetails}
          </button>
        </div>
        <PaymentWidget
          checkout={activeCheckout}
          locale={locale}
          payLabel={copy.payAmount}
          loadingLabel={copy.widgetLoading}
          errorLabel={copy.widgetError}
          retryLabel={copy.widgetRetry}
        />
        {applePayAvailable && (
          // Back out of the chosen method (e.g. Apple Pay sheet won't
          // open) — same dismissal path as Edit, straight to the method
          // control on the details step.
          <button
            type="button"
            onClick={() => setDismissedCheckoutId(activeCheckout.checkoutId)}
            className="self-start text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
          >
            {copy.changeMethod}
          </button>
        )}
      </div>
    );
  }

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
          required={!opts?.optional}
          dir={field.name === 'email' ? 'ltr' : undefined}
          defaultValue={fieldValue(field.name)}
          aria-invalid={hasError ? true : undefined}
        />
        {hasError && <p className="text-al-qatt-red-800 text-sm">{copy.invalid[field.name]}</p>}
      </div>
    );
  };

  return (
    <form action={submitAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="reference" value={reference} />
      {linkToken && <input type="hidden" name="token" value={linkToken} />}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />

      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{copy.heading}</h2>

      <section className="flex flex-col gap-3" aria-label={copy.yourDetails}>
        <h3 className="text-base font-medium">{copy.yourDetails}</h3>
        {identityCollapsed ? (
          <div className="border-sarat-black/8 rounded-input flex items-center justify-between gap-4 [border-width:0.5px] px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <span className="font-medium">
                {fieldValue('givenName')} {fieldValue('surname')}
              </span>
              <span dir="ltr" className="text-sarat-black-600 truncate">
                {fieldValue('email')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditingIdentity(true)}
              className="text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
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
          <div
            role="radiogroup"
            aria-label={copy.methodHeading}
            className="border-sarat-black/8 rounded-input grid grid-cols-2 gap-1 [border-width:0.5px] p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={method === 'applepay'}
              aria-label={copy.methodApplePay}
              onClick={() => setChosenMethod('applepay')}
              className={cn(
                'rounded-input flex h-10 items-center justify-center transition-colors duration-200',
                method === 'applepay'
                  ? 'bg-sarat-black text-white'
                  : 'text-sarat-black-600 hover:text-sarat-black',
              )}
            >
              <ApplePayLockup />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === 'card'}
              onClick={() => setChosenMethod('card')}
              className={cn(
                'rounded-input h-10 text-sm font-medium transition-colors duration-200',
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
                className="shrink-0 text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
              >
                {copy.editDetails}
              </button>
              {ADDRESS_FIELDS.map((f) => (
                <input key={f.name} type="hidden" name={f.name} value={fieldValue(f.name) ?? ''} />
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
                  <p className="text-al-qatt-red-800 text-sm">{copy.invalid.country}</p>
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
      </div>

      <SubmitButton
        copy={copy}
        totalSar={totalSar}
        locale={locale}
        isAccepted={() => termsRef.current?.checked ?? false}
        onBlocked={() => {
          setConsentBlocked(true);
          termsRef.current?.focus();
        }}
      />
    </form>
  );
}
