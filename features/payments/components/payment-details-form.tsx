'use client';

import {
  useActionState,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { createCheckout, type CreateCheckoutState } from '@/features/payments/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  /**
   * Clickwrap consent line with inline links to the Terms, Privacy, and
   * Cancellation pages — built on the server (next-intl rich text) so the
   * link order stays grammatical in both English and Arabic.
   */
  termsLabel: ReactNode;
  /** Shown when the guest tries to pay without ticking the consent box. */
  termsRequired: string;
  payHeading: string;
  widgetLoading: string;
  /** Shown if the HyperPay widget script fails to load. */
  widgetError: string;
  /** Retry action for the failed widget. */
  widgetRetry: string;
  /** Divider between the Apple Pay button and the card form. */
  orPayWithCard: string;
  /** Payment-method choice (shown only on Apple Pay-capable devices). */
  methodHeading: string;
  methodApplePay: string;
  methodCard: string;
  /** Back-link under the mounted widget to pick the other method. */
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
  isAccepted,
  onBlocked,
}: {
  copy: PaymentDetailsCopy;
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
      {pending ? copy.pending : copy.submit}
    </Button>
  );
}

export interface PaymentDetailsFormProps {
  reference: string;
  locale: Locale;
  slug: string;
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

  if (state.status === 'ready' && state.data) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{copy.payHeading}</h2>
        <PaymentWidget
          checkout={state.data}
          loadingLabel={copy.widgetLoading}
          errorLabel={copy.widgetError}
          retryLabel={copy.widgetRetry}
          orCardLabel={copy.orPayWithCard}
        />
        {applePayAvailable && (
          // Back out of the chosen method (e.g. Apple Pay sheet won't
          // open). A full reload restarts at the details step; the next
          // submit supersedes this checkout server-side, so nothing
          // half-paid is left behind.
          <button
            type="button"
            onClick={() => window.location.reload()}
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
        }[state.error ?? 'server']
      : undefined;

  // Echoed submit values always win over the booking-derived prefill.
  const fieldValue = (name: DetailField) => values[name] ?? defaults?.[name];

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
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="reference" value={reference} />
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

      {applePayAvailable && (
        <section className="flex flex-col gap-3" aria-label={copy.methodHeading}>
          <h3 className="text-base font-medium">{copy.methodHeading}</h3>
          <div
            role="radiogroup"
            aria-label={copy.methodHeading}
            className="border-sarat-black/8 rounded-input grid grid-cols-2 gap-1 [border-width:0.5px] p-1"
          >
            {(
              [
                { value: 'applepay', label: copy.methodApplePay },
                { value: 'card', label: copy.methodCard },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={method === option.value}
                onClick={() => setChosenMethod(option.value)}
                className={cn(
                  'rounded-input h-10 text-sm font-medium transition-colors duration-200',
                  method === option.value
                    ? 'bg-sarat-black text-white'
                    : 'text-sarat-black-600 hover:text-sarat-black',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}
      <input type="hidden" name="method" value={applePayAvailable ? method : 'card'} />

      {formError && (
        <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2">
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
            className="border-sarat-black/40 accent-sarat-black mt-0.5 size-5 shrink-0"
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
        isAccepted={() => termsRef.current?.checked ?? false}
        onBlocked={() => {
          setConsentBlocked(true);
          termsRef.current?.focus();
        }}
      />
    </form>
  );
}
