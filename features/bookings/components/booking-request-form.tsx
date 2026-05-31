'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Minus, Plus } from 'lucide-react';
import { requestBooking, type BookingRequestState } from '@/features/bookings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';
import { formatSaudiPhone, formatSAR } from '@/lib/format';

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
  /** Specific, actionable field messages. */
  datePast: string;
  dateUnavailable: string;
  dateFull: string;
  partySizeTooLarge: string;
  /** Empty-option label for the date picker. */
  datePlaceholder: string;
  /** Total row label. */
  total: string;
  /** Guests stepper aria-labels. */
  decrease: string;
  increase: string;
  /** Shown when there are no bookable dates in the window. */
  noDates: string;
}

export interface BookableOption {
  value: string;
  label: string;
  remaining: number;
  /** Pre-formatted "N spots left" (ICU formatted server-side). */
  spotsLabel: string;
}

export interface BookingRequestFormProps {
  experienceSlug: string;
  locale: Locale;
  maxGroupSize: string;
  priceSar: number;
  /** Pre-computed bookable dates (open + with capacity) for the picker. */
  availableDates: readonly BookableOption[];
  /** Short note under the title: instant-confirmation vs request-to-book. */
  modeNote?: string;
  copy: BookingRequestCopy;
}

const FIELD_NAMES = ['name', 'phone', 'preferredDate', 'partySize'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

/** Which fields carry a static helper hint under the label. */
const FIELDS_WITH_HINTS = new Set<FieldName>(['phone', 'preferredDate', 'partySize']);

const initialState: BookingRequestState = { success: false, values: {} };

const SELECT_CLASS =
  'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base';

function SubmitButton({ copy, disabled }: { copy: BookingRequestCopy; disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className="w-full"
      pending={pending}
      disabled={disabled}
    >
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

/** Map a server field-error code to its user-facing message. */
function messageForField(
  field: FieldName,
  code: string | undefined,
  copy: BookingRequestCopy,
): string | undefined {
  if (!code) return undefined;
  if (field === 'preferredDate') {
    if (code === 'date_past') return copy.datePast;
    if (code === 'date_full') return copy.dateFull;
    if (
      code === 'date_closed_weekday' ||
      code === 'date_blackout' ||
      code === 'date_malformed' ||
      code === 'date_stop_sell'
    ) {
      return copy.dateUnavailable;
    }
    return copy.required;
  }
  if (field === 'partySize') {
    return code === 'too_large' ? copy.partySizeTooLarge : copy.required;
  }
  return copy.required;
}

export function BookingRequestForm({
  experienceSlug,
  locale,
  maxGroupSize,
  priceSar,
  availableDates,
  modeNote,
  copy,
}: BookingRequestFormProps) {
  const [state, formAction] = useActionState(requestBooking, initialState);
  const values = state.values ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const noDates = availableDates.length === 0;

  // Date + guests are controlled so we can show a live total + remaining
  // capacity and cap the party size to what the chosen day actually has.
  const [selectedDate, setSelectedDate] = useState<string>(
    values.preferredDate ?? availableDates[0]?.value ?? '',
  );
  const [partySize, setPartySize] = useState<number>(Number(values.partySize) || 1);
  const selectedOption = availableDates.find((d) => d.value === selectedDate);
  const maxGuests = Math.min(
    Number(maxGroupSize) || 1,
    selectedOption ? selectedOption.remaining : Number(maxGroupSize) || 1,
  );
  const effectiveParty = Math.min(Math.max(1, partySize), maxGuests);
  const totalSar = priceSar * effectiveParty;
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

      {modeNote && (
        <p className="bg-juniper-green/8 text-juniper-green-800 rounded-input px-3 py-2 text-sm">
          {modeNote}
        </p>
      )}

      {noDates ? (
        <p className="text-sarat-black-600 rounded-input bg-sarat-black/5 px-3 py-3 text-sm">
          {copy.noDates}
        </p>
      ) : (
        <>
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
              <select
                id="booking-date"
                name="preferredDate"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={SELECT_CLASS}
                {...fieldProps('preferredDate')}
              >
                <option value="" disabled>
                  {copy.datePlaceholder}
                </option>
                {availableDates.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              {selectedOption ? (
                <p
                  id={hintId('preferredDate')}
                  className="text-juniper-green-800 inline-flex items-center gap-1.5 text-sm"
                >
                  <span className="bg-juniper-green size-1.5 rounded-full" aria-hidden />
                  {selectedOption.spotsLabel}
                </p>
              ) : (
                <p id={hintId('preferredDate')} className="text-sarat-black-600 text-sm">
                  {copy.preferredDateHint}
                </p>
              )}
              <FieldError
                id={errorId('preferredDate')}
                message={messageForField('preferredDate', state.fields?.preferredDate, copy)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="booking-party-size" className="text-sm font-medium">
                {copy.partySize}
              </label>
              {/* Stepper — keeps the value within [1, capacity] without a keyboard. */}
              <div className="border-sarat-black/20 rounded-input flex h-11 items-center justify-between [border-width:0.5px] px-1">
                <button
                  type="button"
                  aria-label={copy.decrease}
                  disabled={effectiveParty <= 1}
                  onClick={() => setPartySize(Math.max(1, effectiveParty - 1))}
                  className="text-sarat-black hover:bg-sarat-black/5 inline-flex size-9 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-30"
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <span id="booking-party-size" className="text-base font-medium tabular-nums">
                  {effectiveParty}
                </span>
                <button
                  type="button"
                  aria-label={copy.increase}
                  disabled={effectiveParty >= maxGuests}
                  onClick={() => setPartySize(Math.min(maxGuests, effectiveParty + 1))}
                  className="text-sarat-black hover:bg-sarat-black/5 inline-flex size-9 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-30"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
              <input type="hidden" name="partySize" value={String(effectiveParty)} />
              <p id={hintId('partySize')} className="text-sarat-black-600 text-sm">
                {copy.partySizeHint}
              </p>
              <FieldError
                id={errorId('partySize')}
                message={messageForField('partySize', state.fields?.partySize, copy)}
              />
            </div>
          </div>

          {/* Live total + breakdown */}
          <div className="border-sarat-black/8 flex flex-col gap-1 [border-top-width:0.5px] pt-4">
            <p className="text-sarat-black-600 flex items-baseline justify-between text-sm">
              <span dir="ltr">
                {formatSAR(priceSar, locale)} × {effectiveParty}
              </span>
            </p>
            <p className="flex items-baseline justify-between text-base font-medium">
              <span>{copy.total}</span>
              <span>{formatSAR(totalSar, locale)}</span>
            </p>
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
        </>
      )}
    </form>
  );
}
