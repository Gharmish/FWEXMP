'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { createCheckout, type CreateCheckoutState } from '@/features/payments/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';
import { PaymentWidget } from './payment-widget';

export interface PaymentDetailsCopy {
  heading: string;
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
  invalid: string;
  /** Form-level error messages keyed by error code. */
  errorValidation: string;
  errorServer: string;
  errorUnavailable: string;
  errorNotFound: string;
  errorAlreadyPaid: string;
  payHeading: string;
  widgetLoading: string;
}

type DetailField = keyof Pick<
  PaymentDetailsCopy,
  'givenName' | 'surname' | 'email' | 'street1' | 'city' | 'state' | 'postcode' | 'country'
>;

const TEXT_FIELDS: readonly { name: DetailField; autoComplete: string; type?: string }[] = [
  { name: 'givenName', autoComplete: 'given-name' },
  { name: 'surname', autoComplete: 'family-name' },
  { name: 'email', autoComplete: 'email', type: 'email' },
  { name: 'street1', autoComplete: 'address-line1' },
  { name: 'city', autoComplete: 'address-level2' },
  { name: 'state', autoComplete: 'address-level1' },
  { name: 'postcode', autoComplete: 'postal-code' },
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
}

export function PaymentDetailsForm({ reference, locale, slug, copy }: PaymentDetailsFormProps) {
  const [state, formAction] = useActionState(createCheckout, initialState);
  const values = state.values ?? {};
  const errorId = useId();

  if (state.status === 'ready' && state.data) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{copy.payHeading}</h2>
        <PaymentWidget checkout={state.data} loadingLabel={copy.widgetLoading} />
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
        }[state.error ?? 'server']
      : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />

      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{copy.heading}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => {
          const hasError = Boolean(state.fields?.[field.name]);
          return (
            <div
              key={field.name}
              className={
                field.name === 'street1'
                  ? 'flex flex-col gap-2 sm:col-span-2'
                  : 'flex flex-col gap-2'
              }
            >
              <label htmlFor={`pay-${field.name}`} className="text-sm font-medium">
                {copy[field.name]}
              </label>
              <Input
                id={`pay-${field.name}`}
                name={field.name}
                type={field.type ?? 'text'}
                autoComplete={field.autoComplete}
                required
                dir={field.name === 'email' ? 'ltr' : undefined}
                defaultValue={values[field.name]}
                aria-invalid={hasError ? true : undefined}
              />
              {hasError && <p className="text-al-qatt-red-800 text-sm">{copy.invalid}</p>}
            </div>
          );
        })}

        <div className="flex flex-col gap-2">
          <label htmlFor="pay-country" className="text-sm font-medium">
            {copy.country}
          </label>
          <Input
            id="pay-country"
            name="country"
            autoComplete="country"
            required
            maxLength={2}
            defaultValue={values.country ?? 'SA'}
            aria-invalid={state.fields?.country ? true : undefined}
            className="uppercase"
          />
          {state.fields?.country && <p className="text-al-qatt-red-800 text-sm">{copy.invalid}</p>}
        </div>
      </div>

      {formError && (
        <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
        </p>
      )}

      <SubmitButton copy={copy} />
    </form>
  );
}
