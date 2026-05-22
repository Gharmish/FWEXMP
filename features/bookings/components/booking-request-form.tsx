'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestBooking, type BookingRequestState } from '@/features/bookings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';
import { formatSaudiPhone } from '@/lib/format';

interface BookingRequestCopy {
  title: string;
  name: string;
  phone: string;
  preferredDate: string;
  partySize: string;
  phoneHint: string;
  preferredDateHint: string;
  partySizeHint: string;
  submit: string;
  pending: string;
  validation: string;
  server: string;
  notFound: string;
  required: string;
}

export interface BookingRequestFormProps {
  experienceSlug: string;
  locale: Locale;
  maxGroupSize: string;
  copy: BookingRequestCopy;
}

const FIELD_NAMES = ['name', 'phone', 'preferredDate', 'partySize'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

/** Which fields carry a static helper hint under the label. */
const FIELDS_WITH_HINTS = new Set<FieldName>(['phone', 'preferredDate', 'partySize']);

const initialState: BookingRequestState = { success: false, values: {} };

function SubmitButton({ copy }: { copy: BookingRequestCopy }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? copy.pending : copy.submit}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-al-qatt-red-800 text-sm">
      {message}
    </p>
  );
}

export function BookingRequestForm({
  experienceSlug,
  locale,
  maxGroupSize,
  copy,
}: BookingRequestFormProps) {
  const [state, formAction] = useActionState(requestBooking, initialState);
  const values = state.values ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  // Phone field is controlled so we can canonicalise on blur via
  // formatSaudiPhone (e.g. "0512345678" -> "+966 51 234 5678"). All
  // other fields stay uncontrolled — they don't need keystroke-level
  // handling and `defaultValue` is enough to echo server-validation
  // errors back to the user.
  //
  // We don't sync `phone` from state.values.phone on server-side
  // errors: useActionState preserves the component across re-renders,
  // so whatever the user just typed (and submitted) is still in
  // `phone`. The server echo is informational — they match.
  const [phone, setPhone] = useState<string>(values.phone ?? '');
  // Deterministic IDs for each field's error message — fed into
  // aria-describedby so screen readers associate the error with the
  // input it belongs to.
  const errorPrefix = useId();
  const errorId = (field: FieldName) => `${errorPrefix}-${field}-error`;
  const hintId = (field: FieldName) => `${errorPrefix}-${field}-hint`;
  const formErrorId = `${errorPrefix}-form-error`;

  // The success path on the server action redirects to
  // /book/confirmed/[ref] before this component ever sees a success
  // state — so anything observable here is one of the error branches.
  const formMessage =
    state.message === 'server'
      ? copy.server
      : state.message === 'notFound'
        ? copy.notFound
        : state.message === 'validation'
          ? copy.validation
          : undefined;

  // After a failed submit, move focus to the first invalid field — or,
  // failing that, to the form-level error region. WCAG 3.3.1 (Error
  // Identification) + 3.3.3 (Error Suggestion): the user must be able
  // to perceive *and reach* the error without hunting.
  useEffect(() => {
    if (!state.fields && !formMessage) return;
    const form = formRef.current;
    if (!form) return;

    for (const field of FIELD_NAMES) {
      if (state.fields?.[field]) {
        const el = form.elements.namedItem(field);
        if (el instanceof HTMLElement) {
          el.focus();
          return;
        }
      }
    }

    const alert = form.querySelector<HTMLElement>('[data-form-error]');
    alert?.focus();
  }, [state, formMessage]);

  function fieldProps(field: FieldName) {
    const hasError = Boolean(state.fields?.[field]);
    const hasHint = FIELDS_WITH_HINTS.has(field);
    // aria-describedby supports a space-separated list — when both a
    // hint and an error apply, screen readers announce the hint first
    // then the error, matching the visual order.
    const describedBy =
      [hasHint ? hintId(field) : null, hasError ? errorId(field) : null]
        .filter((id): id is string => id !== null)
        .join(' ') || undefined;
    return {
      'aria-invalid': hasError ? ('true' as const) : undefined,
      'aria-describedby': describedBy,
    };
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="experienceSlug" value={experienceSlug} />
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-2">
        <label htmlFor="booking-name" className="text-sm font-medium">
          {copy.name}
        </label>
        <Input
          id="booking-name"
          name="name"
          autoComplete="name"
          required
          defaultValue={values.name}
          {...fieldProps('name')}
        />
        <FieldError id={errorId('name')} message={state.fields?.name && copy.required} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="booking-phone" className="text-sm font-medium">
          {copy.phone}
        </label>
        <Input
          id="booking-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          dir="ltr"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          onBlur={() => {
            // Canonicalise on blur, not on every keystroke — formatting
            // mid-typing fights the caret. formatSaudiPhone returns the
            // input untouched when the value isn't a recognisable Saudi
            // mobile, so this is a no-op for partial / non-Saudi input.
            const formatted = formatSaudiPhone(phone);
            if (formatted !== phone) setPhone(formatted);
          }}
          placeholder="+966 5X XXX XXXX"
          {...fieldProps('phone')}
        />
        <p id={hintId('phone')} className="text-sarat-black-600 text-sm">
          {copy.phoneHint}
        </p>
        <FieldError id={errorId('phone')} message={state.fields?.phone && copy.required} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div className="flex flex-col gap-2">
          <label htmlFor="booking-date" className="text-sm font-medium">
            {copy.preferredDate}
          </label>
          <Input
            id="booking-date"
            name="preferredDate"
            type="date"
            required
            defaultValue={values.preferredDate}
            {...fieldProps('preferredDate')}
          />
          <p id={hintId('preferredDate')} className="text-sarat-black-600 text-sm">
            {copy.preferredDateHint}
          </p>
          <FieldError
            id={errorId('preferredDate')}
            message={state.fields?.preferredDate && copy.required}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="booking-party-size" className="text-sm font-medium">
            {copy.partySize}
          </label>
          <Input
            id="booking-party-size"
            name="partySize"
            type="number"
            min={1}
            max={maxGroupSize}
            required
            defaultValue={values.partySize ?? '1'}
            {...fieldProps('partySize')}
          />
          <p id={hintId('partySize')} className="text-sarat-black-600 text-sm">
            {copy.partySizeHint}
          </p>
          <FieldError
            id={errorId('partySize')}
            message={state.fields?.partySize && copy.required}
          />
        </div>
      </div>

      {formMessage && (
        <p
          id={formErrorId}
          data-form-error
          role="alert"
          tabIndex={-1}
          className="text-al-qatt-red-800 text-sm focus:outline-none"
        >
          {formMessage}
        </p>
      )}

      <SubmitButton copy={copy} />
    </form>
  );
}
