'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCheckout, type CreateCheckoutState } from '@/features/payments/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';
import { COUNTRIES, countryName } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { PaymentWidget } from './payment-widget';

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
  payHeading: string;
  widgetLoading: string;
  /** Shown if the HyperPay widget script fails to load. */
  widgetError: string;
  /** Retry action for the failed widget. */
  widgetRetry: string;
  /** Divider between the Apple Pay button and the card form. */
  orPayWithCard: string;
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

function SubmitButton({ copy }: { copy: PaymentDetailsCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" pending={pending}>
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
  defaults,
}: PaymentDetailsFormProps) {
  const [state, formAction] = useActionState(createCheckout, initialState);
  const values = state.values ?? {};
  const errorId = useId();
  const [editingIdentity, setEditingIdentity] = useState(false);

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
      </section>

      {formError && (
        <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
        </p>
      )}

      <SubmitButton copy={copy} />
    </form>
  );
}
