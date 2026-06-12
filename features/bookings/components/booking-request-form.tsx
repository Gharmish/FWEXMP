'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { requestBooking, type BookingRequestState } from '@/features/bookings/actions';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { vatPortionSar } from '@/features/bookings/lib/vat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pop, SPRING } from '@/components/ui/motion';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { PhoneInput } from '@/components/ui/phone-input';
import { Price } from '@/components/ui/price';
import { BookingCalendar } from './booking-calendar';

interface BookingRequestCopy {
  title: string;
  name: string;
  phone: string;
  email: string;
  emailHint: string;
  /** Shown when a non-empty email doesn't parse. */
  emailInvalid: string;
  preferredDate: string;
  partySize: string;
  phoneHint: string;
  /** Accessible label for the dialling-code selector. */
  countryLabel: string;
  /** Placeholder for the national-number input (no leading zero). */
  phonePlaceholder: string;
  /** Shown when a non-empty number isn't valid for the chosen country. */
  phoneInvalid: string;
  preferredDateHint: string;
  partySizeHint: string;
  submit: string;
  pending: string;
  validation: string;
  server: string;
  notFound: string;
  /** Account blocked from booking by the team. */
  suspended: string;
  /** Rate-limited: too many open bookings/requests from this caller. */
  tooMany: string;
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
  /** "Includes VAT (15%)" disclosure label — prices are VAT-inclusive. */
  vatIncluded: string;
  /** Guests stepper aria-labels. */
  decrease: string;
  increase: string;
  /** Shown when there are no bookable dates in the window. */
  noDates: string;
  /** Calendar month-navigation aria-labels. */
  prevMonth: string;
  nextMonth: string;
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
  /** Inclusive booking window bounds, `YYYY-MM-DD` (today Riyadh → horizon). */
  minDate: string;
  maxDate: string;
  /** Pre-computed bookable dates (open + with capacity) for the picker. */
  availableDates: readonly BookableOption[];
  /** Short note under the title: instant-confirmation vs request-to-book. */
  modeNote?: string;
  /** Caption under the date label, e.g. "Runs Fri & Sat" — sets expectations. */
  scheduleNote?: string;
  copy: BookingRequestCopy;
}

const FIELD_NAMES = ['name', 'phone', 'email', 'preferredDate', 'partySize'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

/** Which fields carry a static helper hint under the label. */
const FIELDS_WITH_HINTS = new Set<FieldName>(['phone', 'email', 'preferredDate', 'partySize']);

const initialState: BookingRequestState = { success: false, values: {} };

function SubmitButton({
  copy,
  disabled,
  fullWidth = true,
}: {
  copy: BookingRequestCopy;
  disabled?: boolean;
  /** Inline form CTA fills its column; the sticky bar CTA sizes to content. */
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className={fullWidth ? 'w-full' : 'shrink-0'}
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
  if (field === 'phone') {
    return code === 'invalid_phone' ? copy.phoneInvalid : copy.required;
  }
  if (field === 'email') {
    return code === 'invalid_email' ? copy.emailInvalid : copy.required;
  }
  return copy.required;
}

export function BookingRequestForm({
  experienceSlug,
  locale,
  maxGroupSize,
  priceSar,
  minDate,
  maxDate,
  availableDates,
  modeNote,
  scheduleNote,
  copy,
}: BookingRequestFormProps) {
  const [state, formAction] = useActionState(requestBooking, initialState);
  const values = state.values ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const noDates = availableDates.length === 0;
  const reduce = useReducedMotion();

  // Client-side validation errors, keyed like the server's `state.fields` and
  // produced by the *same* zod schema (BRIEF §7). They give instant feedback
  // for an empty name / missing or malformed phone without a server round
  // trip; an actual submit still validates server-side (and re-checks
  // availability, which the client can't know).
  const [clientFields, setClientFields] = useState<Partial<Record<FieldName, string>>>({});

  // Mobile sticky CTA bar: visible only while the inline submit is scrolled
  // out of view. A sentinel at the inline button drives an Intersection
  // Observer — when it's on screen the user can book inline, so the bar
  // retracts (and stops covering the footer at the bottom of the page).
  const inlineSubmitRef = useRef<HTMLDivElement>(null);
  const [stickyBarVisible, setStickyBarVisible] = useState(false);
  useEffect(() => {
    const el = inlineSubmitRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyBarVisible(!entry.isIntersecting),
      // Trigger a touch early so the details fields aren't covered as they
      // scroll into reach.
      { rootMargin: '0px 0px -96px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [noDates]);

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
  // The phone field is its own component (PhoneInput): a dialling-code
  // selector + national-number input that posts one canonical E.164 value
  // via a hidden `phone` input. It re-hydrates from `values.phone` (the
  // server echo) after a validation error.
  // Deterministic IDs for each field's error message — fed into
  // aria-describedby so screen readers associate the error with the
  // input it belongs to.
  const errorPrefix = useId();
  const errorId = (field: FieldName) => `${errorPrefix}-${field}-error`;
  const hintId = (field: FieldName) => `${errorPrefix}-${field}-hint`;
  const formErrorId = `${errorPrefix}-form-error`;

  // A field is in error if the client flagged it (instant) or the server did
  // (after submit). The client clears its set on every valid submit, so the
  // two never show stale-and-fresh together.
  const errorFor = (field: FieldName): string | undefined =>
    clientFields[field] ?? state.fields?.[field];
  const hasClientErrors = Object.keys(clientFields).length > 0;

  // The success path on the server action redirects to
  // /book/confirmed/[ref] before this component ever sees a success
  // state — so anything observable here is one of the error branches.
  const formMessage = hasClientErrors
    ? copy.validation
    : state.message === 'server'
      ? copy.server
      : state.message === 'notFound'
        ? copy.notFound
        : state.message === 'suspended'
          ? copy.suspended
          : state.message === 'too_many'
            ? copy.tooMany
            : state.message === 'validation'
              ? copy.validation
              : undefined;

  // After a failed submit (client or server), move focus to the first invalid
  // field — or, failing that, to the form-level error region. WCAG 3.3.1 (Error
  // Identification) + 3.3.3 (Error Suggestion): the user must be able to
  // perceive *and reach* the error without hunting.
  useEffect(() => {
    if (!state.fields && !formMessage && !hasClientErrors) return;
    const form = formRef.current;
    if (!form) return;

    for (const field of FIELD_NAMES) {
      if (!errorFor(field)) continue;
      // The phone field posts a hidden E.164 input; focus its visible national
      // input instead. `preferredDate` is a hidden calendar-fed input — focusing
      // it is a no-op, so skip it and let focus fall through to the alert.
      const el =
        field === 'phone'
          ? form.querySelector<HTMLElement>('input[autocomplete="tel-national"]')
          : (form.elements.namedItem(field) as HTMLElement | null);
      if (el instanceof HTMLElement && el.getAttribute('type') !== 'hidden') {
        el.focus();
        return;
      }
    }

    const alert = form.querySelector<HTMLElement>('[data-form-error]');
    alert?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, formMessage, clientFields]);

  // Validate with the shared schema before the server action fires. On failure
  // we block the submit and surface field errors through the same display the
  // server path uses; on success we clear and let the action proceed (so the
  // form still works if JS-driven validation is ever bypassed).
  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const read = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    const parsed = bookingRequestSchema.safeParse({
      experienceSlug,
      locale,
      name: read('name'),
      phone: read('phone'),
      email: read('email'),
      preferredDate: selectedDate,
      partySize: String(effectiveParty),
    });
    if (parsed.success) {
      setClientFields({});
      return;
    }
    event.preventDefault();
    const fields: Partial<Record<FieldName, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && (FIELD_NAMES as readonly string[]).includes(key)) {
        fields[key as FieldName] = String(issue.message);
      }
    }
    setClientFields(fields);
  }

  function fieldProps(field: FieldName) {
    const hasError = Boolean(errorFor(field));
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
    <form
      ref={formRef}
      action={formAction}
      onSubmit={validateBeforeSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
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
          {/* 1 — Pick a date. Calendar drives the hidden `preferredDate`. */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">{copy.preferredDate}</span>
            {scheduleNote && <p className="text-sarat-black-600 -mt-1 text-sm">{scheduleNote}</p>}
            <BookingCalendar
              locale={locale}
              minDate={minDate}
              maxDate={maxDate}
              options={availableDates}
              value={selectedDate}
              onSelect={setSelectedDate}
              copy={{ prevMonth: copy.prevMonth, nextMonth: copy.nextMonth }}
            />
            <input type="hidden" name="preferredDate" value={selectedDate} />
            {selectedOption ? (
              <p
                id={hintId('preferredDate')}
                className="text-juniper-green-800 inline-flex items-center gap-2 text-sm"
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
              message={messageForField('preferredDate', errorFor('preferredDate'), copy)}
            />
          </div>

          {/* 2 — Choose party size. */}
          <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
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
                className="text-sarat-black hover:bg-sarat-black/5 inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-30"
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
                className="text-sarat-black hover:bg-sarat-black/5 inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-30"
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
              message={messageForField('partySize', errorFor('partySize'), copy)}
            />
          </div>

          {/* 3 — Live total + breakdown. The amount pops on change. */}
          <div className="border-sarat-black/8 flex flex-col gap-1 [border-top-width:0.5px] pt-4">
            <p className="text-sarat-black-600 flex items-baseline justify-between text-sm">
              <span dir="ltr">
                <Price amount={priceSar} locale={locale} /> × {effectiveParty}
              </span>
            </p>
            <div className="flex items-baseline justify-between text-base font-medium">
              <span>{copy.total}</span>
              <Pop key={totalSar}>
                <Price amount={totalSar} locale={locale} />
              </Pop>
            </div>
            <p className="text-sarat-black-600 flex items-baseline justify-between text-sm">
              <span>{copy.vatIncluded}</span>
              <Price amount={vatPortionSar(totalSar)} locale={locale} />
            </p>
          </div>

          {/* 4 — Your details. */}
          <div className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-4">
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
              <FieldError id={errorId('name')} message={errorFor('name') && copy.required} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="booking-phone" className="text-sm font-medium">
                {copy.phone}
              </label>
              <PhoneInput
                id="booking-phone"
                name="phone"
                locale={locale}
                defaultValue={values.phone}
                required
                placeholder={copy.phonePlaceholder}
                countryLabel={copy.countryLabel}
                invalid={Boolean(errorFor('phone'))}
                aria-describedby={fieldProps('phone')['aria-describedby']}
              />
              <p id={hintId('phone')} className="text-sarat-black-600 text-sm">
                {copy.phoneHint}
              </p>
              <FieldError
                id={errorId('phone')}
                message={messageForField('phone', errorFor('phone'), copy)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="booking-email" className="text-sm font-medium">
                {copy.email}
              </label>
              <Input
                id="booking-email"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                defaultValue={values.email}
                {...fieldProps('email')}
              />
              <p id={hintId('email')} className="text-sarat-black-600 text-sm">
                {copy.emailHint}
              </p>
              <FieldError
                id={errorId('email')}
                message={messageForField('email', errorFor('email'), copy)}
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

          <div ref={inlineSubmitRef}>
            <SubmitButton copy={copy} />
          </div>

          {/* Mobile-only sticky CTA. Lives inside the form so its button
              submits natively; springs up from the bottom edge while the
              inline submit is off-screen. `inert` keeps it out of the tab
              order and a11y tree while retracted. */}
          <motion.div
            inert={!stickyBarVisible}
            initial={false}
            animate={{ y: reduce ? 0 : stickyBarVisible ? 0 : '110%' }}
            transition={SPRING}
            className={cn(
              'border-sarat-black/8 fixed inset-x-0 bottom-0 z-40 [border-top-width:0.5px] bg-white/95 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden',
              !stickyBarVisible && 'pointer-events-none',
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sarat-black-600 text-sm">{copy.total}</span>
                <span className="truncate text-lg font-medium">
                  <Price amount={totalSar} locale={locale} />
                </span>
              </span>
              <SubmitButton copy={copy} fullWidth={false} />
            </div>
          </motion.div>
        </>
      )}
    </form>
  );
}
