'use client';

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import {
  requestBooking,
  type BookingRequestState,
  type OpenBookingSummary,
} from '@/features/bookings/actions';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { vatPortionSar } from '@/features/bookings/lib/vat';
import { Button } from '@/components/ui/button';
import { FieldError as SpringFieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Pop, SPRING } from '@/components/ui/motion';
import { Link, type Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { trackAddToCart } from '@/lib/funnel-tracking';
import { cn } from '@/lib/utils';
import { PhoneInput } from '@/components/ui/phone-input';
import { Price } from '@/components/ui/price';
import { BookingCalendar } from './booking-calendar';
import type { BookableOption } from '@/features/bookings/types';
import { readStoredUtm } from '@/features/analytics/utm-capture';

export type { BookableOption } from '@/features/bookings/types';

interface BookingRequestCopy {
  title: string;
  /** Expand action on the collapsed "booking as" summary. */
  editDetails: string;
  name: string;
  phone: string;
  email: string;
  emailHint: string;
  /** Optional note to the host (2026-08-22 host-dashboard audit P1-3). */
  noteLabel: string;
  noteHint: string;
  notePlaceholder: string;
  noteTooLong: string;
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
  /** CTA on each open-booking card shown under the `tooMany` error. */
  tooManyFinish: string;
  /** Closing guidance under the open-booking cards. */
  tooManyHint: string;
  /** Status lines on the open-booking cards, keyed by what the row awaits. */
  tooManyStatusPayment: string;
  tooManyStatusApproval: string;
  tooManyStatusConfirmed: string;
  required: string;
  /** Per-field empty-submit messages — `required` is only the fallback. */
  nameRequired: string;
  phoneRequired: string;
  emailRequired: string;
  /** Specific, actionable field messages. */
  datePast: string;
  dateUnavailable: string;
  dateCutoff: string;
  dateFull: string;
  partySizeTooLarge: string;
  /** Empty-option label for the date picker. */
  datePlaceholder: string;
  /** Total row label. */
  total: string;
  /**
   * "Includes VAT (15%)" disclosure label — prices are VAT-inclusive.
   * Null while the platform VAT toggle is off: no VAT line renders.
   */
  vatIncluded: string | null;
  /** Guests stepper aria-labels. */
  decrease: string;
  increase: string;
  /** Shown when there are no bookable dates in the window. */
  noDates: string;
  /** Calendar month-navigation aria-labels. */
  prevMonth: string;
  nextMonth: string;
  /** Women-only eligibility acknowledgment — only used when required. */
  womenOnlyLabel: string;
  /** Shown when the guest tries to book without the women-only acknowledgment. */
  womenOnlyRequired: string;
  /** Minimum-age attestation — only used when the experience has a `minAge`. */
  minAgeLabel: string;
  /** Shown when the guest tries to book without the minimum-age attestation. */
  minAgeRequired: string;
  /** Shown when the guest tries to book without accepting the terms. */
  termsRequired: string;
  /** Marketing-consent checkbox label — optional, unchecked by default. */
  marketingConsentLabel: string;
}

/**
 * Contact details we already hold for this visitor (signed-in account or a
 * returning guest resolved from the last-booking cookie). Any present field
 * prefills its input; when all three are known the details block collapses to
 * a "booking as" summary the guest can expand to edit. Type-only mirror of
 * `KnownGuestDetails` so this client component never imports the server query.
 */
export interface BookingKnownGuest {
  name?: string;
  /** Canonical E.164 — `PhoneInput` re-hydrates the country + national parts. */
  phone?: string;
  email?: string;
}

export interface BookingRequestFormProps {
  experienceSlug: string;
  locale: Locale;
  maxGroupSize: string;
  priceSar: number;
  /** Prefill for a known visitor — see {@link BookingKnownGuest}. */
  known?: BookingKnownGuest;
  /** Inclusive booking window bounds, `YYYY-MM-DD` (today Riyadh → horizon). */
  minDate: string;
  maxDate: string;
  /** Pre-computed bookable dates (open + with capacity) for the picker. */
  availableDates: readonly BookableOption[];
  /** Short note under the title: instant-confirmation vs request-to-book. */
  modeNote?: string;
  /** Caption under the date label, e.g. "Runs Fri & Sat" — sets expectations. */
  scheduleNote?: string;
  /**
   * Pre-selected date (`YYYY-MM-DD`) — carried back from the payment
   * step's "change date or guests" link so the guest edits their choice
   * instead of restarting. Only honored when still a bookable option.
   */
  initialDate?: string;
  /** Pre-selected party size — same provenance as `initialDate`. */
  initialPartySize?: number;
  /**
   * Platform VAT rate in basis points, or null while VAT collection is
   * off. Paired with `copy.vatIncluded` — both come from the server page.
   */
  vatRateBps?: number | null;
  /**
   * True for `women_only` experiences: renders a required eligibility
   * acknowledgment the guest must tick before booking. The server enforces
   * the same rule regardless of this flag.
   */
  requireWomenOnly?: boolean;
  /**
   * True when the experience has a minimum age (`minAge > 0`): renders a
   * required whole-party age attestation. Server-enforced regardless.
   */
  requireMinAge?: boolean;
  /**
   * Terms/Privacy/Cancellation acceptance label with its inline links —
   * built server-side with t.rich so the client bundle carries no
   * translation plumbing. Always rendered; acceptance is required and
   * server-enforced (2026-08-02 legal audit).
   */
  termsLabel: ReactNode;
  copy: BookingRequestCopy;
}

const FIELD_NAMES = ['name', 'phone', 'email', 'preferredDate', 'partySize', 'guestNote'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

/** Which fields carry a static helper hint under the label. */
const FIELDS_WITH_HINTS = new Set<FieldName>([
  'phone',
  'email',
  'preferredDate',
  'partySize',
  'guestNote',
]);

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
  // Shared spring slide-in (components/ui/field-error); the form's own gap
  // classes already provide spacing, so the default mt is neutralised.
  return (
    <SpringFieldError id={id} className="mt-0">
      {message}
    </SpringFieldError>
  );
}

/** Status line for an open-booking card under the throttle error. */
function statusLabel(booking: OpenBookingSummary, copy: BookingRequestCopy): string {
  if (booking.state === 'payment') return copy.tooManyStatusPayment;
  if (booking.state === 'approval') return copy.tooManyStatusApproval;
  return copy.tooManyStatusConfirmed;
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
    if (code === 'date_cutoff') return copy.dateCutoff;
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
  if (field === 'name') {
    return copy.nameRequired;
  }
  if (field === 'phone') {
    return code === 'invalid_phone' ? copy.phoneInvalid : copy.phoneRequired;
  }
  if (field === 'email') {
    return code === 'invalid_email' ? copy.emailInvalid : copy.emailRequired;
  }
  if (field === 'guestNote') {
    return copy.noteTooLong;
  }
  return copy.required;
}

export function BookingRequestForm({
  experienceSlug,
  locale,
  maxGroupSize,
  priceSar,
  known,
  minDate,
  maxDate,
  availableDates,
  modeNote,
  scheduleNote,
  initialDate,
  initialPartySize,
  vatRateBps,
  requireWomenOnly = false,
  requireMinAge = false,
  termsLabel,
  copy,
}: BookingRequestFormProps) {
  const [state, formAction] = useActionState(requestBooking, initialState);
  // First-touch UTM (see UtmCapture) is appended at submit time, not as
  // hidden inputs: sessionStorage doesn't exist during SSR, so rendering
  // it would risk a hydration mismatch. Runs client-side by construction.
  const submitWithUtm = (formData: FormData) => {
    const utm = readStoredUtm();
    if (utm.source) formData.set('utmSource', utm.source);
    if (utm.medium) formData.set('utmMedium', utm.medium);
    if (utm.campaign) formData.set('utmCampaign', utm.campaign);
    // Ad-platform click ids ride along the same way — an auto-tagged ad
    // click often carries ONLY a click id (no utm_*), and offline
    // conversion upload is impossible without persisting it.
    if (utm.gclid) formData.set('gclid', utm.gclid);
    if (utm.ttclid) formData.set('ttclid', utm.ttclid);
    if (utm.fbclid) formData.set('fbclid', utm.fbclid);
    if (utm.ref) formData.set('referralCode', utm.ref);
    formAction(formData);
  };
  const values = state.values ?? {};
  const openBookings = state.openBookings ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  // Idempotency key, minted once per form mount (BRIEF §6 — safe retries):
  // a double-tap or a network-layer re-POST re-sends the same key and the
  // server dedupes to the first booking instead of creating a second one.
  // Deliberately NOT re-minted after a failed submit — the state update
  // re-renders but keeps this state, and a validation retry with the same
  // key is exactly the retry the key exists to make safe.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // …but a bfcache restore (hard-navigation back) resurrects the page
  // snapshot with a possibly USED key, where a new submission must not be
  // swallowed as a replay. Soft (router) back-navigations remount the
  // component and mint fresh anyway; this covers the hard-nav case.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIdempotencyKey(crypto.randomUUID());
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
  const noDates = availableDates.length === 0;
  const reduce = useReducedMotion();

  // Client-side validation errors, keyed like the server's `state.fields` and
  // produced by the *same* zod schema (BRIEF §7). They give instant feedback
  // for an empty name / missing or malformed phone without a server round
  // trip; an actual submit still validates server-side (and re-checks
  // availability, which the client can't know).
  const [clientFields, setClientFields] = useState<Partial<Record<FieldName, string>>>({});

  // Women-only eligibility acknowledgment (only rendered when `requireWomenOnly`).
  // An affirmative tick that blocks the submit until given; the server enforces
  // it regardless. Kept UNCONTROLLED (like the contact fields) so the tick
  // survives React 19's post-action form reset — its checked state is read from
  // the form at submit and re-defaulted from the server echo on a failed submit.
  const [womenOnlyBlocked, setWomenOnlyBlocked] = useState(false);
  const womenOnlyRef = useRef<HTMLInputElement>(null);
  // Client + server ('womenOnly' field code) both surface the same error.
  const womenOnlyError = womenOnlyBlocked || state.fields?.womenOnly === 'required';

  // Minimum-age attestation (rendered when `requireMinAge`) and the
  // Terms/Privacy/Cancellation acceptance (always rendered) — same
  // uncontrolled-checkbox pattern as the women-only acknowledgment above.
  const [minAgeBlocked, setMinAgeBlocked] = useState(false);
  const minAgeRef = useRef<HTMLInputElement>(null);
  const minAgeError = minAgeBlocked || state.fields?.minAge === 'required';
  const [termsBlocked, setTermsBlocked] = useState(false);
  const termsRef = useRef<HTMLInputElement>(null);
  const termsError = termsBlocked || state.fields?.terms === 'required';

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
  // Precedence: server echo (failed submit) → carried-back choice from the
  // payment step (when still bookable) → first available.
  const carriedDate =
    initialDate && availableDates.some((d) => d.value === initialDate) ? initialDate : undefined;
  const [selectedDate, setSelectedDate] = useState<string>(
    values.preferredDate ?? carriedDate ?? availableDates[0]?.value ?? '',
  );
  const [partySize, setPartySize] = useState<number>(
    Number(values.partySize) || initialPartySize || 1,
  );
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
  const womenOnlyErrorId = `${errorPrefix}-women-only-error`;
  const minAgeErrorId = `${errorPrefix}-min-age-error`;
  const termsErrorId = `${errorPrefix}-terms-error`;

  // A field is in error if the client flagged it (instant) or the server did
  // (after submit). The client clears its set on every valid submit, so the
  // two never show stale-and-fresh together.
  const errorFor = (field: FieldName): string | undefined =>
    clientFields[field] ?? state.fields?.[field];
  const hasClientErrors = Object.keys(clientFields).length > 0;

  // Prefill precedence for the contact fields: a failed-submit server echo
  // (never lose what the guest typed) → what we already know about them.
  const detailValue = (field: 'name' | 'phone' | 'email'): string | undefined =>
    values[field] ?? known?.[field];
  // When we hold all three contact fields and none is in error, the details
  // block collapses to a "booking as" summary the guest can expand to edit —
  // a returning guest confirms instead of retyping. A rejected value must
  // never hide behind the summary, so any error forces the fields open.
  const [editingDetails, setEditingDetails] = useState(false);
  const detailsComplete = Boolean(
    detailValue('name') && detailValue('phone') && detailValue('email'),
  );
  const detailsHaveError = Boolean(errorFor('name') || errorFor('phone') || errorFor('email'));
  const detailsCollapsed = detailsComplete && !detailsHaveError && !editingDetails;

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

  // Bring an invalid control into view, centred, then focus it. A bare
  // focus() only scrolls until the element clears the viewport edge — on
  // mobile that strip sits behind the fixed sticky CTA bar, so a blocked
  // submit from the bar looked like a dead tap with the error off-screen.
  // Instant (not smooth) on purpose: a smooth scroll can be silently
  // cancelled by concurrent scroll work, which re-creates the dead tap.
  const revealInvalid = (el: HTMLElement) => {
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  };

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
        revealInvalid(el);
        return;
      }
    }

    // Server-side checkbox rejections (JS validation bypassed or stale
    // form): the acknowledgments aren't in FIELD_NAMES, so reveal them
    // explicitly.
    if (state.fields?.womenOnly && womenOnlyRef.current) {
      revealInvalid(womenOnlyRef.current);
      return;
    }
    if (state.fields?.minAge && minAgeRef.current) {
      revealInvalid(minAgeRef.current);
      return;
    }
    if (state.fields?.terms && termsRef.current) {
      revealInvalid(termsRef.current);
      return;
    }

    const alert = form.querySelector<HTMLElement>('[data-form-error]');
    if (alert) revealInvalid(alert);
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
    // The acknowledgments can't be skipped — read straight from the
    // (uncontrolled) checkboxes in the submitted form.
    const checkboxChecked = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
    const womenOnlyMissing = requireWomenOnly && !checkboxChecked('womenOnly');
    const minAgeMissing = requireMinAge && !checkboxChecked('minAge');
    const termsMissing = !checkboxChecked('terms');
    const acknowledgmentMissing = womenOnlyMissing || minAgeMissing || termsMissing;
    if (parsed.success && !acknowledgmentMissing) {
      setClientFields({});
      setWomenOnlyBlocked(false);
      setMinAgeBlocked(false);
      setTermsBlocked(false);
      trackAddToCart({ id: experienceSlug, priceSar, partySize: effectiveParty });
      return;
    }
    event.preventDefault();
    if (parsed.success) {
      setClientFields({});
    } else {
      const fields: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && (FIELD_NAMES as readonly string[]).includes(key)) {
          fields[key as FieldName] = String(issue.message);
        }
      }
      setClientFields(fields);
    }
    setWomenOnlyBlocked(womenOnlyMissing);
    setMinAgeBlocked(minAgeMissing);
    setTermsBlocked(termsMissing);
    // When the fields are otherwise valid, no field grabs focus — scroll the
    // first missing acknowledgment into view (clear of the sticky CTA bar)
    // and focus it so the blocker is perceivable and reachable.
    if (parsed.success) {
      const target = womenOnlyMissing
        ? womenOnlyRef.current
        : minAgeMissing
          ? minAgeRef.current
          : termsMissing
            ? termsRef.current
            : null;
      if (target) revealInvalid(target);
    }
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
      action={submitWithUtm}
      onSubmit={validateBeforeSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="experienceSlug" value={experienceSlug} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

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
            {/* The chosen date's EXACT cancellation deadline (pre-formatted
                server-side from the policy engine) — the generic "until 24
                hours before" tier copy made concrete, updating per date. */}
            {selectedOption?.cancellationNote && (
              <p className="text-sarat-black-600 text-sm">{selectedOption.cancellationNote}</p>
            )}
            <FieldError
              id={errorId('preferredDate')}
              message={messageForField('preferredDate', errorFor('preferredDate'), copy)}
            />
          </div>

          {/* 2 — Choose party size. `role="group"` + labelledby replaces the
              old `<label for>` pointing at a span (spans aren't labelable, so
              that association was void); the live region announces +/- taps. */}
          <div
            role="group"
            aria-labelledby="booking-party-size-label"
            className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4"
          >
            <span id="booking-party-size-label" className="text-sm font-medium">
              {copy.partySize}
            </span>
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
              <span
                id="booking-party-size"
                aria-live="polite"
                className="text-base font-medium tabular-nums"
              >
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
            {copy.vatIncluded && vatRateBps ? (
              <p className="text-sarat-black-600 flex items-baseline justify-between text-sm">
                <span>{copy.vatIncluded}</span>
                <Price amount={vatPortionSar(totalSar, vatRateBps)} locale={locale} />
              </p>
            ) : null}
          </div>

          {/* 4 — Your details. Collapses to a summary for a returning guest
              we already know; the fields (prefilled) reappear on Edit or if
              any of them is rejected. Hidden inputs carry the known values
              while collapsed so the summary still posts a complete form. */}
          <div className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-4">
            {detailsCollapsed ? (
              <>
                <div className="border-sarat-black/8 rounded-input flex items-center justify-between gap-4 [border-width:0.5px] px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="font-medium">{detailValue('name')}</span>
                    <span dir="ltr" className="text-sarat-black-600 truncate">
                      {detailValue('phone')}
                    </span>
                    <span dir="ltr" className="text-sarat-black-600 truncate">
                      {detailValue('email')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDetails(true)}
                    className="shrink-0 text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
                  >
                    {copy.editDetails}
                  </button>
                </div>
                <input type="hidden" name="name" value={detailValue('name') ?? ''} />
                <input type="hidden" name="phone" value={detailValue('phone') ?? ''} />
                <input type="hidden" name="email" value={detailValue('email') ?? ''} />
              </>
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
                    defaultValue={detailValue('name')}
                    {...fieldProps('name')}
                  />
                  <FieldError
                    id={errorId('name')}
                    message={messageForField('name', errorFor('name'), copy)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="booking-phone" className="text-sm font-medium">
                    {copy.phone}
                  </label>
                  <PhoneInput
                    id="booking-phone"
                    name="phone"
                    locale={locale}
                    defaultValue={detailValue('phone')}
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
                    required
                    defaultValue={detailValue('email')}
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
              </>
            )}
          </div>

          {/* A line to the host — dietary needs, kids' ages, pickup point.
              Optional; shows on the host's request card, never publicly. */}
          <div className="flex flex-col gap-2">
            <label htmlFor="booking-note" className="text-sm font-medium">
              {copy.noteLabel}
            </label>
            <textarea
              id="booking-note"
              name="guestNote"
              rows={3}
              maxLength={500}
              defaultValue={values.guestNote}
              placeholder={copy.notePlaceholder}
              className="rounded-input border-sarat-black/20 text-sarat-black placeholder:text-sarat-black-600 aria-invalid:border-al-qatt-red w-full [border-width:0.5px] bg-white px-4 py-3 text-base"
              {...fieldProps('guestNote')}
            />
            <p id={hintId('guestNote')} className="text-sarat-black-600 text-sm">
              {copy.noteHint}
            </p>
            <FieldError
              id={errorId('guestNote')}
              message={messageForField('guestNote', errorFor('guestNote'), copy)}
            />
          </div>

          {requireWomenOnly && (
            <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  ref={womenOnlyRef}
                  type="checkbox"
                  name="womenOnly"
                  defaultChecked={values.womenOnly === 'on'}
                  onChange={(event) => {
                    if (event.target.checked) setWomenOnlyBlocked(false);
                  }}
                  aria-invalid={womenOnlyError ? true : undefined}
                  aria-describedby={womenOnlyError ? womenOnlyErrorId : undefined}
                  className="border-sarat-black/40 accent-sarat-black mt-0.5 size-5 shrink-0"
                />
                <span className="text-sm leading-relaxed">{copy.womenOnlyLabel}</span>
              </label>
              {womenOnlyError && (
                <p id={womenOnlyErrorId} role="alert" className="text-al-qatt-red-800 ps-8 text-sm">
                  {copy.womenOnlyRequired}
                </p>
              )}
            </div>
          )}

          {requireMinAge && (
            <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  ref={minAgeRef}
                  type="checkbox"
                  name="minAge"
                  defaultChecked={values.minAge === 'on'}
                  onChange={(event) => {
                    if (event.target.checked) setMinAgeBlocked(false);
                  }}
                  aria-invalid={minAgeError ? true : undefined}
                  aria-describedby={minAgeError ? minAgeErrorId : undefined}
                  className="border-sarat-black/40 accent-sarat-black mt-0.5 size-5 shrink-0"
                />
                <span className="text-sm leading-relaxed">{copy.minAgeLabel}</span>
              </label>
              {minAgeError && (
                <p id={minAgeErrorId} role="alert" className="text-al-qatt-red-800 ps-8 text-sm">
                  {copy.minAgeRequired}
                </p>
              )}
            </div>
          )}

          {/* Terms/Privacy/Cancellation acceptance — required at the booking
              step, not only at checkout, so request-to-book guests are also
              covered (2026-08-02 legal audit). */}
          <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                ref={termsRef}
                type="checkbox"
                name="terms"
                defaultChecked={values.terms === 'on'}
                onChange={(event) => {
                  if (event.target.checked) setTermsBlocked(false);
                }}
                aria-invalid={termsError ? true : undefined}
                aria-describedby={termsError ? termsErrorId : undefined}
                className="border-sarat-black/40 accent-sarat-black mt-0.5 size-5 shrink-0"
              />
              <span className="text-sm leading-relaxed">{termsLabel}</span>
            </label>
            {termsError && (
              <p id={termsErrorId} role="alert" className="text-al-qatt-red-800 ps-8 text-sm">
                {copy.termsRequired}
              </p>
            )}
            {/* Marketing consent — separate from the required terms tick,
                UNCHECKED by default, and never blocks the booking. The
                action snapshots it per booking and stamps the durable
                guest-level grant; without it the guest gets transactional
                messages only. */}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="marketingConsent"
                defaultChecked={values.marketingConsent === 'on'}
                className="border-sarat-black/40 accent-sarat-black mt-0.5 size-5 shrink-0"
              />
              <span className="text-sarat-black-600 text-sm leading-relaxed">
                {copy.marketingConsentLabel}
              </span>
            </label>
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

          {/* The throttle error becomes a way forward: each verified open
              booking links to its own page, where the guest can complete
              payment or cancel to free the spot. Only ownership-verified
              bookings ever arrive here (see the server action). */}
          {state.message === 'too_many' && !hasClientErrors && openBookings.length > 0 && (
            <div className="flex flex-col gap-2">
              {openBookings.map((booking) => (
                <Link
                  key={booking.reference}
                  href={`/book/confirmed/${booking.reference}?slug=${encodeURIComponent(booking.experienceSlug)}`}
                  className="border-sarat-black/8 rounded-input hover:bg-sarat-black/5 flex items-center justify-between gap-3 [border-width:0.5px] px-4 py-3 transition-colors duration-200"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{booking.title}</span>
                    <span className="text-sarat-black-600 text-sm">
                      {formatDate(new Date(`${booking.date}T00:00:00+03:00`), locale, 'gregory', {
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      · {statusLabel(booking, copy)}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
                    {copy.tooManyFinish}
                    <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                  </span>
                </Link>
              ))}
              <p className="text-sarat-black-600 text-sm">{copy.tooManyHint}</p>
            </div>
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
            data-bottom-dock
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
                {/* The calendar auto-selects a first date — the bar must show
                    WHICH day is being booked, not just what it costs. */}
                {selectedOption && (
                  <span className="text-sarat-black-600 truncate text-sm">
                    {selectedOption.label}
                  </span>
                )}
                <span className="flex items-baseline gap-2">
                  <span className="text-sarat-black-600 text-sm">{copy.total}</span>
                  <span className="truncate text-lg font-medium">
                    <Price amount={totalSar} locale={locale} />
                  </span>
                </span>
              </span>
              {/* First tap on the bar with an entirely untouched contact
                  block scrolls to the fields instead of submitting into a
                  wall of validation errors — the bar is visible from page
                  load on mobile, well before the fields are in view. Any
                  typed value (or a returning guest's collapsed summary)
                  restores native submit; validation handles the rest. */}
              <span
                onClickCapture={(event) => {
                  const form = formRef.current;
                  if (!form || detailsCollapsed) return;
                  const read = (name: string) =>
                    (form.elements.namedItem(name) as HTMLInputElement | null)?.value?.trim() ?? '';
                  if (read('name') || read('phone') || read('email')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const el = form.elements.namedItem('name');
                  if (el instanceof HTMLElement) revealInvalid(el);
                }}
              >
                <SubmitButton copy={copy} fullWidth={false} />
              </span>
            </div>
          </motion.div>
        </>
      )}
    </form>
  );
}
