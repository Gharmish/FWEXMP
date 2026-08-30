'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/field-error';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  updateBookingContact,
  type UpdateBookingContactState,
} from '@/features/bookings/contact-actions';

interface Copy {
  /** The collapsed "Wrong? Update it" affordance. */
  summary: string;
  emailLabel: string;
  phoneLabel: string;
  countryLabel: string;
  submit: string;
  pending: string;
  done: string;
  /** Per-field validation messages keyed by the zod message keys. */
  errors: Record<'required' | 'invalid_email' | 'invalid_phone', string>;
  formErrors: Record<
    'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'account_email' | 'validation' | 'server',
    string
  >;
}

export interface BookingContactFormProps {
  reference: string;
  locale: Locale;
  /** The contact details currently on the booking, for prefill. */
  defaults: { email: string | null; phone: string | null };
  copy: Copy;
}

const initialState: UpdateBookingContactState = { success: false };

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Collapsible contact corrector on the pending / awaiting-payment
 * confirmation page — the typo safety net for the unverified email and
 * phone every lifecycle notification depends on. Quiet by design: a
 * `details` disclosure, same pattern as ReportProblemForm.
 */
export function BookingContactForm({ reference, locale, defaults, copy }: BookingContactFormProps) {
  const [state, action] = useActionState(updateBookingContact, initialState);
  const prefix = useId();

  if (state.success) {
    return (
      <p
        role="status"
        className="text-juniper-green-800 inline-flex items-center gap-2 text-sm font-medium"
      >
        <Check className="size-4 shrink-0" aria-hidden />
        {copy.done}
      </p>
    );
  }

  const fieldError = (field: 'email' | 'phone'): string | undefined => {
    const key = state.fields?.[field];
    return key ? (copy.errors[key as keyof Copy['errors']] ?? key) : undefined;
  };
  const formError =
    state.message && state.message !== 'validation'
      ? (copy.formErrors[state.message as keyof Copy['formErrors']] ?? copy.formErrors.server)
      : undefined;

  return (
    <details className="group">
      <summary className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium underline-offset-4 hover:underline">
        {copy.summary}
      </summary>
      <form action={action} noValidate className="mt-3 flex max-w-md flex-col gap-3">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={`${prefix}-email`} className="flex flex-col gap-1.5 text-sm font-medium">
          {copy.emailLabel}
          <Input
            id={`${prefix}-email`}
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            defaultValue={state.values?.email ?? defaults.email ?? ''}
            aria-invalid={fieldError('email') ? 'true' : undefined}
            aria-describedby={fieldError('email') ? `${prefix}-email-error` : undefined}
          />
          <FieldError id={`${prefix}-email-error`}>{fieldError('email')}</FieldError>
        </label>
        <label htmlFor={`${prefix}-phone`} className="flex flex-col gap-1.5 text-sm font-medium">
          {copy.phoneLabel}
          <PhoneInput
            id={`${prefix}-phone`}
            name="phone"
            locale={locale}
            defaultValue={state.values?.phone ?? defaults.phone ?? undefined}
            countryLabel={copy.countryLabel}
            invalid={Boolean(fieldError('phone'))}
            aria-describedby={fieldError('phone') ? `${prefix}-phone-error` : undefined}
          />
          <FieldError id={`${prefix}-phone-error`}>{fieldError('phone')}</FieldError>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Submit label={copy.submit} pending={copy.pending} />
          {formError && (
            <p role="alert" className="text-al-qatt-red-800 text-sm">
              {formError}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
