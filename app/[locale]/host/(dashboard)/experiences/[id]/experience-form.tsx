'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Price } from '@/components/ui/price';
import { isArPlaceholder } from '@/lib/ar-placeholder';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { splitCommission } from '@/features/bookings/lib/commission';
import { LocationPicker } from '@/features/host-experiences/components/location-picker';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import { cn } from '@/lib/utils';
import { fillTemplate } from '@/lib/fill-template';
import type { Locale } from '@/lib/i18n';
import {
  updateHostExperience,
  type HostExperienceState,
} from '@/features/host-experiences/actions';
import {
  DEFAULT_BOOKING_CUTOFF_HOURS,
  EXPERIENCE_CATEGORIES,
  hasMeetingPoint,
  hostExperienceInputSchema,
  normalizeDigits,
  UNSET_NUMBER,
  UNSET_TEXT,
} from '@/features/host-experiences/schemas';
import type { HostExperienceRow } from '@/features/host-experiences/queries';

/**
 * The listing-details form on the host edit page. Creation is a
 * separate one-field step (`new/new-experience-form.tsx`); this form
 * only ever edits an existing row, so every value is prefilled from it
 * and a draft's `UNSET_*` sentinels render as empty inputs with
 * placeholders rather than as real-looking defaults.
 *
 * Every visible string is supplied via `copy` so the file owns zero UI
 * text. `copy.errors.fields` is keyed by the zod issue messages the
 * action surfaces (`title_short`, …); we map the snake_case codes
 * through `FIELD_ERROR_KEY` to camelCase translation keys.
 */

type FieldErrorCode =
  | 'title_short'
  | 'title_long'
  | 'title_either'
  | 'title_ar_invalid'
  | 'description_short'
  | 'description_long'
  | 'description_ar_invalid'
  | 'duration_short'
  | 'duration_long'
  | 'price_negative'
  | 'price_too_high'
  | 'place_short'
  | 'place_long'
  | 'time_invalid'
  | 'coords_invalid'
  | 'group_invalid'
  | 'age_invalid'
  | 'required';

const FIELD_ERROR_KEY: Record<FieldErrorCode, keyof ExperienceFormCopy['errors']['fields']> = {
  title_short: 'titleShort',
  title_long: 'titleLong',
  title_either: 'titleEither',
  title_ar_invalid: 'titleArInvalid',
  description_short: 'descriptionShort',
  description_long: 'descriptionLong',
  description_ar_invalid: 'descriptionArInvalid',
  duration_short: 'durationShort',
  duration_long: 'durationLong',
  price_negative: 'priceNegative',
  price_too_high: 'priceTooHigh',
  place_short: 'placeShort',
  place_long: 'placeLong',
  time_invalid: 'timeInvalid',
  coords_invalid: 'coordsInvalid',
  group_invalid: 'groupInvalid',
  age_invalid: 'ageInvalid',
  required: 'required',
};

type FormMessageKey =
  | 'validation'
  | 'server'
  | 'forbidden'
  | 'notFound'
  | 'noDb'
  | 'lockedReview'
  | 'archived';

const FORM_MESSAGE_KEY: Partial<
  Record<NonNullable<HostExperienceState['message']>, FormMessageKey>
> = {
  validation: 'validation',
  server: 'server',
  forbidden: 'forbidden',
  not_found: 'notFound',
  no_db: 'noDb',
  locked_review: 'lockedReview',
  archived: 'archived',
};

export interface ExperienceFormCopy {
  sectionBasics: string;
  sectionPracticalities: string;
  sectionPlace: string;
  sectionDetail: string;
  sectionAvailability: string;
  titleLabel: string;
  titleHint: string;
  titleArLabel: string;
  descriptionLabel: string;
  descriptionHint: string;
  descriptionArLabel: string;
  /** Under an optional-language field — blank fields fall back to the team. */
  arOptionalHint: string;
  /** "{count} / {max}" counter template under the text fields. */
  counter: string;
  categoryLabel: string;
  durationLabel: string;
  durationHoursLabel: string;
  durationMinutesLabel: string;
  priceLabel: string;
  priceHint: string;
  /** "Guests pay X · You keep ≈ Y" — rendered with live numbers. */
  priceYouKeep: string;
  priceVatIncluded: string;
  groupSizeLabel: string;
  minAgeLabel: string;
  minAgeHint: string;
  placeNameLabel: string;
  placeNameHint: string;
  startTimeLabel: string;
  startTimeHint: string;
  bookingCutoffLabel: string;
  bookingCutoffHint: string;
  /** Preset cutoff choices, each with its localized label. */
  bookingCutoffOptions: readonly { value: number; label: string }[];
  latLabel: string;
  lngLabel: string;
  coordsHint: string;
  coordsPasteLabel: string;
  coordsPastePlaceholder: string;
  coordsPasteInvalid: string;
  coordsPreviewTitle: string;
  mapSearchLabel: string;
  mapSearchPlaceholder: string;
  mapSearchButton: string;
  mapSearchNotFound: string;
  mapHint: string;
  mapUnsetHint: string;
  manualCoordsLabel: string;
  cityLabel: string;
  regionLabel: string;
  inclusionsLabel: string;
  inclusionsPlaceholder: string;
  inclusionsHint: string;
  inclusionsArLabel: string;
  inclusionsArPlaceholder: string;
  whatToBringLabel: string;
  whatToBringPlaceholder: string;
  whatToBringHint: string;
  whatToBringArLabel: string;
  whatToBringArPlaceholder: string;
  cancellationLabel: string;
  /** Full one-sentence terms per policy preset, keyed by tier value. */
  cancellationTiers: Record<'flexible' | 'moderate' | 'strict', string>;
  /** Short tier names for the select options ("Flexible" / "مرنة"). */
  cancellationTierNames: Record<'flexible' | 'moderate' | 'strict', string>;
  cancellationHint: string;
  weekdaysLabel: string;
  weekdaysHint: string;
  /** Sun..Sat order, matching `availabilityWeekdays` index 0..6. */
  weekdays: readonly [string, string, string, string, string, string, string];
  /** Category labels keyed by the same enum value as `EXPERIENCE_CATEGORIES`. */
  categories: Record<(typeof EXPERIENCE_CATEGORIES)[number], string>;
  submitEdit: string;
  submitEditPending: string;
  /** Sticky bar: "Unsaved changes". */
  unsaved: string;
  /** Sticky bar on a public listing: material edits go back to review. */
  unsavedReviewNote: string;
  /** Rendered instead of the form controls while the listing is locked. */
  lockedReview: string;
  lockedArchived: string;
  errors: {
    validation: string;
    server: string;
    forbidden: string;
    notFound: string;
    noDb: string;
    lockedReview: string;
    archived: string;
    fields: {
      titleShort: string;
      titleLong: string;
      titleEither: string;
      titleArInvalid: string;
      descriptionShort: string;
      descriptionLong: string;
      descriptionArInvalid: string;
      durationShort: string;
      durationLong: string;
      priceNegative: string;
      priceTooHigh: string;
      placeShort: string;
      placeLong: string;
      timeInvalid: string;
      coordsInvalid: string;
      groupInvalid: string;
      ageInvalid: string;
      required: string;
    };
  };
}

export interface ExperienceFormCityOption {
  /** Canonical English name — the value submitted and stored. */
  nameEn: string;
  region: string;
  /** Locale-resolved display label. */
  label: string;
}

export interface ExperienceFormProps {
  locale: Locale;
  copy: ExperienceFormCopy;
  experience: HostExperienceRow;
  /** Enabled operating cities (admin catalog registry). */
  cityOptions: readonly ExperienceFormCityOption[];
  /** Live VAT rate for the take-home preview, or null while VAT is off. */
  vatRateBps: number | null;
}

const initialState: HostExperienceState = { success: false };

/** Stored Arabic for prefill — the `TODO(ar)` placeholder reads as empty. */
function arText(value: string): string {
  return !isArPlaceholder(value) ? value : '';
}

/** A draft's `UNSET_NUMBER` renders as an empty input, never as "0". */
function numText(value: number): string {
  return value === UNSET_NUMBER ? '' : String(value);
}

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
  'aria-invalid:border-al-qatt-red',
);
const SELECT_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base',
  'disabled:pointer-events-none disabled:opacity-50',
);

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-al-qatt-red-800 text-sm">
      {message}
    </p>
  );
}

function Counter({ count, max, copy }: { count: number; max: number; copy: ExperienceFormCopy }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        count > max ? 'text-al-qatt-red-800' : 'text-sarat-black-600',
      )}
      aria-live="polite"
    >
      {fillTemplate(copy.counter, { count, max })}
    </span>
  );
}

function fieldErrorMessage(code: string | undefined, copy: ExperienceFormCopy): string | undefined {
  if (!code) return undefined;
  const key = FIELD_ERROR_KEY[code as FieldErrorCode];
  if (key) return copy.errors.fields[key];
  // Fallback: zod issue messages we don't have a specific copy for fall
  // through to the generic "Check this field." line.
  return copy.errors.fields.required;
}

function formMessage(state: HostExperienceState, copy: ExperienceFormCopy): string | undefined {
  if (!state.message) return undefined;
  const key = FORM_MESSAGE_KEY[state.message];
  return key ? copy.errors[key] : copy.errors.server;
}

/**
 * Fields with a client-side blur check. The same strict zod field the
 * server uses validates a NON-EMPTY value (an empty one is a draft
 * gap, reported by the readiness checklist instead); the server stays
 * the source of truth on submit.
 */
type BlurField =
  | 'titleEn'
  | 'titleAr'
  | 'descriptionEn'
  | 'descriptionAr'
  | 'priceSar'
  | 'maxGroupSize'
  | 'minAge'
  | 'placeName';

function blurCode(field: BlurField, value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const result = hostExperienceInputSchema.shape[field].safeParse(normalizeDigits(trimmed));
  return result.success ? undefined : result.error.issues[0]?.message;
}

export function ExperienceForm({
  locale,
  copy,
  experience,
  cityOptions,
  vatRateBps,
}: ExperienceFormProps) {
  const [state, formAction] = useActionState(updateHostExperience, initialState);

  // Failed submits echo the raw values back (React 19 resets uncontrolled
  // inputs after a form action) — always prefer the echo over the stored row.
  const v = state.values;

  const locked = experience.status === 'pending_review' || experience.status === 'archived';
  const isPublic = experience.status === 'live' || experience.status === 'paused';

  // City comes from the operating-cities registry. A legacy row whose
  // city predates the registry (or was disabled since) keeps its value
  // as an extra option so editing never silently relocates it.
  const cityDefault = v?.city || (experience.city ?? cityOptions[0]?.nameEn ?? 'Abha');
  const cityChoices = cityOptions.some((o) => o.nameEn === cityDefault)
    ? cityOptions
    : [
        { nameEn: cityDefault, region: experience.region ?? 'Aseer', label: cityDefault },
        ...cityOptions,
      ];
  const [region, setRegion] = useState(
    v?.region ||
      (experience.region ?? cityChoices.find((o) => o.nameEn === cityDefault)?.region ?? 'Aseer'),
  );
  const [tier, setTier] = useState<'flexible' | 'moderate' | 'strict'>(
    (v?.cancellationTier as 'flexible' | 'moderate' | 'strict' | undefined) ??
      experience.cancellationTier,
  );

  // Prefill — echo first, then the row (sentinel-aware).
  const titleEnDefault = v?.titleEn ?? experience.titleEn;
  const titleArDefault = v?.titleAr ?? arText(experience.titleAr);
  const descriptionEnDefault = v?.descriptionEn ?? experience.descriptionEn;
  const descriptionArDefault = v?.descriptionAr ?? arText(experience.descriptionAr);
  const storedMinutes = experience.durationMinutes;
  const durationHoursDefault =
    v?.durationHours ??
    (storedMinutes === UNSET_NUMBER ? '' : String(Math.floor(storedMinutes / 60)));
  const durationMinsDefault =
    v?.durationMins ?? (storedMinutes === UNSET_NUMBER ? '' : String(storedMinutes % 60));
  const priceDefault = v?.priceSar ?? numText(experience.priceSar);
  const groupDefault = v?.maxGroupSize ?? numText(experience.maxGroupSize);
  const startTimeDefault = v?.startTime ?? experience.startTime;
  const placeNameDefault = v?.placeName ?? experience.placeName;
  const pinSet = v?.lat ? v.lat.trim() !== '' : hasMeetingPoint(experience.lat, experience.lng);

  // Live counters + take-home preview read the field as typed.
  const [lengths, setLengths] = useState({
    titleEn: titleEnDefault.length,
    titleAr: titleArDefault.length,
    descriptionEn: descriptionEnDefault.length,
    descriptionAr: descriptionArDefault.length,
  });
  // Read the target synchronously — React nulls `currentTarget` after
  // the handler returns, before a batched updater runs.
  const setLength = (field: keyof typeof lengths, length: number) =>
    setLengths((l) => (l[field] === length ? l : { ...l, [field]: length }));
  const [price, setPrice] = useState(priceDefault);
  const priceNumber = Number(normalizeDigits(price));
  const payoutSar =
    Number.isFinite(priceNumber) && priceNumber > 0
      ? splitCommission(Math.round(priceNumber), experience.commissionBps, vatRateBps).payoutSar
      : null;

  // Client blur checks — re-evaluated on every blur; the server's
  // `fields` are merged over them when an action state lands.
  const [clientErrors, setClientErrors] = useState<Partial<Record<BlurField, string>>>({});
  const onBlurCheck =
    (field: BlurField) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const code = blurCode(field, e.currentTarget.value);
      setClientErrors((prev) => {
        if (prev[field] === code) return prev;
        return { ...prev, [field]: code };
      });
    };

  // Dirty tracking → sticky save bar + close-tab guard. Map picks go
  // through `onChange` on the picker (a state-driven input value
  // doesn't dispatch a native `input` event to the form).
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  // Server-validated failures land while the host is still parked at the
  // submit button, far below the errored field on the longest form in the
  // product — move them to the first problem (the role="alert" lines
  // announce it for screen readers either way).
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.success || !state.message) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) {
      invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
      invalid.focus({ preventScroll: true });
    } else {
      formErrorRef.current?.focus();
    }
  }, [state]);

  const errorPrefix = useId();
  const eid = (k: string) => `${errorPrefix}-${k}-error`;

  const inclusionsDefault = v?.inclusionsRaw ?? experience.inclusions.join('\n');
  const inclusionsArDefault = v?.inclusionsArRaw ?? experience.inclusionsAr.join('\n');
  const whatToBringDefault = v?.whatToBringRaw ?? experience.whatToBring.join('\n');
  const whatToBringArDefault = v?.whatToBringArRaw ?? experience.whatToBringAr.join('\n');
  const weekdaysDefault = new Set(
    v?.availabilityWeekdays ?? experience.availabilityWeekdays.map(String),
  );

  const serverFields = state.fields ?? {};
  const fields: Record<string, string | undefined> = { ...clientErrors, ...serverFields };
  const formError = formMessage(state, copy);

  // Visible section eyebrows — the long form was one unbroken column
  // (legends were sr-only), which made it hard to scan. The sr-only
  // legend stays for screen readers; this is its visual twin.
  const sectionClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  const labelRow = 'flex items-baseline justify-between gap-3';

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-12"
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="experienceId" value={experience.id} />

      {locked && (
        <p
          role="status"
          className="border-saffron-gold/40 bg-saffron-gold/10 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
        >
          {experience.status === 'archived' ? copy.lockedArchived : copy.lockedReview}
        </p>
      )}

      <fieldset disabled={locked} className="contents">
        {/* ----- Basics ----- */}
        <fieldset className="flex flex-col gap-6">
          <legend className="sr-only">{copy.sectionBasics}</legend>
          <p aria-hidden className={sectionClassName}>
            {copy.sectionBasics}
          </p>

          {/* English and Arabic side by side — the host authors either or
              both; a blank side falls back to the partnerships team. */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className={labelRow}>
                <label htmlFor="ex-titleEn" className="text-sm font-medium">
                  {copy.titleLabel}
                </label>
                <Counter count={lengths.titleEn} max={120} copy={copy} />
              </div>
              <Input
                id="ex-titleEn"
                name="titleEn"
                // English-authored content — without this the AR form renders
                // typed English with RTL bidi (punctuation jumps to line start).
                dir="ltr"
                maxLength={120}
                defaultValue={titleEnDefault}
                onInput={(e) => setLength('titleEn', e.currentTarget.value.length)}
                onBlur={onBlurCheck('titleEn')}
                aria-invalid={fields.titleEn ? 'true' : undefined}
                aria-describedby={fields.titleEn ? eid('titleEn') : undefined}
              />
              <p className="text-sarat-black-600 text-sm">{copy.titleHint}</p>
              <FieldError id={eid('titleEn')} message={fieldErrorMessage(fields.titleEn, copy)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className={labelRow}>
                <label htmlFor="ex-titleAr" className="text-sm font-medium">
                  {copy.titleArLabel}
                </label>
                <Counter count={lengths.titleAr} max={160} copy={copy} />
              </div>
              <Input
                id="ex-titleAr"
                name="titleAr"
                dir="rtl"
                maxLength={160}
                defaultValue={titleArDefault}
                onInput={(e) => setLength('titleAr', e.currentTarget.value.length)}
                onBlur={onBlurCheck('titleAr')}
                aria-invalid={fields.titleAr ? 'true' : undefined}
                aria-describedby={fields.titleAr ? eid('titleAr') : undefined}
              />
              <p className="text-sarat-black-600 text-sm">{copy.arOptionalHint}</p>
              <FieldError id={eid('titleAr')} message={fieldErrorMessage(fields.titleAr, copy)} />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className={labelRow}>
                <label htmlFor="ex-descriptionEn" className="text-sm font-medium">
                  {copy.descriptionLabel}
                </label>
                <Counter count={lengths.descriptionEn} max={4000} copy={copy} />
              </div>
              <textarea
                id="ex-descriptionEn"
                name="descriptionEn"
                dir="ltr"
                rows={8}
                maxLength={4000}
                defaultValue={descriptionEnDefault}
                onInput={(e) => setLength('descriptionEn', e.currentTarget.value.length)}
                onBlur={onBlurCheck('descriptionEn')}
                className={TEXTAREA_CLASS}
                aria-invalid={fields.descriptionEn ? 'true' : undefined}
                aria-describedby={fields.descriptionEn ? eid('descriptionEn') : undefined}
              />
              <p className="text-sarat-black-600 text-sm">{copy.descriptionHint}</p>
              <FieldError
                id={eid('descriptionEn')}
                message={fieldErrorMessage(fields.descriptionEn, copy)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className={labelRow}>
                <label htmlFor="ex-descriptionAr" className="text-sm font-medium">
                  {copy.descriptionArLabel}
                </label>
                <Counter count={lengths.descriptionAr} max={5000} copy={copy} />
              </div>
              <textarea
                id="ex-descriptionAr"
                name="descriptionAr"
                dir="rtl"
                rows={8}
                maxLength={5000}
                defaultValue={descriptionArDefault}
                onInput={(e) => setLength('descriptionAr', e.currentTarget.value.length)}
                onBlur={onBlurCheck('descriptionAr')}
                className={TEXTAREA_CLASS}
                aria-invalid={fields.descriptionAr ? 'true' : undefined}
                aria-describedby={fields.descriptionAr ? eid('descriptionAr') : undefined}
              />
              <p className="text-sarat-black-600 text-sm">{copy.arOptionalHint}</p>
              <FieldError
                id={eid('descriptionAr')}
                message={fieldErrorMessage(fields.descriptionAr, copy)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-category" className="text-sm font-medium">
              {copy.categoryLabel}
            </label>
            <select
              id="ex-category"
              name="category"
              defaultValue={v?.category ?? experience.category}
              className={SELECT_CLASS}
            >
              {EXPERIENCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {copy.categories[c]}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* ----- Logistics ----- */}
        <fieldset className="border-sarat-black/8 grid gap-6 [border-top-width:0.5px] pt-12 sm:grid-cols-2">
          <legend className="sr-only">{copy.sectionPracticalities}</legend>
          <p aria-hidden className={cn(sectionClassName, 'sm:col-span-2')}>
            {copy.sectionPracticalities}
          </p>

          <div className="flex flex-col gap-2">
            <p id="ex-duration-label" className="text-sm font-medium">
              {copy.durationLabel}
            </p>
            {/* Hours + minutes — hosts think "3 hours", not "180". The
                action folds the pair into `durationMinutes`. */}
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-labelledby="ex-duration-label"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="ex-durationHours" className="text-sarat-black-600 text-xs">
                  {copy.durationHoursLabel}
                </label>
                <Input
                  id="ex-durationHours"
                  name="durationHours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  placeholder="2"
                  dir="ltr"
                  defaultValue={durationHoursDefault}
                  aria-invalid={fields.durationMinutes ? 'true' : undefined}
                  aria-describedby={fields.durationMinutes ? eid('durationMinutes') : undefined}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ex-durationMins" className="text-sarat-black-600 text-xs">
                  {copy.durationMinutesLabel}
                </label>
                <Input
                  id="ex-durationMins"
                  name="durationMins"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  step={5}
                  placeholder="30"
                  dir="ltr"
                  defaultValue={durationMinsDefault}
                  aria-invalid={fields.durationMinutes ? 'true' : undefined}
                  aria-describedby={fields.durationMinutes ? eid('durationMinutes') : undefined}
                />
              </div>
            </div>
            <FieldError
              id={eid('durationMinutes')}
              message={fieldErrorMessage(fields.durationMinutes, copy)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-startTime" className="text-sm font-medium">
              {copy.startTimeLabel}
            </label>
            <Input
              id="ex-startTime"
              name="startTime"
              type="time"
              dir="ltr"
              defaultValue={startTimeDefault === UNSET_TEXT ? undefined : startTimeDefault}
              aria-invalid={fields.startTime ? 'true' : undefined}
              aria-describedby={fields.startTime ? eid('startTime') : undefined}
            />
            <p className="text-sarat-black-600 text-sm">{copy.startTimeHint}</p>
            <FieldError id={eid('startTime')} message={fieldErrorMessage(fields.startTime, copy)} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-priceSar" className="text-sm font-medium">
              {copy.priceLabel} (<RiyalSymbol className="h-[0.9em] align-[-0.1em]" />)
            </label>
            <Input
              id="ex-priceSar"
              name="priceSar"
              type="number"
              inputMode="numeric"
              min={0}
              max={50000}
              placeholder="240"
              dir="ltr"
              defaultValue={priceDefault}
              onInput={(e) => setPrice(e.currentTarget.value)}
              onBlur={onBlurCheck('priceSar')}
              aria-invalid={fields.priceSar ? 'true' : undefined}
              aria-describedby={fields.priceSar ? eid('priceSar') : 'ex-priceSar-hint'}
            />
            {/* Take-home preview at the moment of pricing (audit P1-3):
                the partnership share used to live in a separate section
                on the same page, far from the number it applies to. */}
            <p id="ex-priceSar-hint" className="text-sarat-black-600 text-sm">
              {payoutSar !== null ? (
                <>
                  <span className="text-sarat-black font-medium">
                    {copy.priceYouKeep}{' '}
                    <Price amount={payoutSar} locale={locale} className="tabular-nums" />
                  </span>
                  {' · '}
                  {copy.priceHint}
                  {vatRateBps !== null && <> {copy.priceVatIncluded}</>}
                </>
              ) : (
                <>
                  {copy.priceHint}
                  {vatRateBps !== null && <> {copy.priceVatIncluded}</>}
                </>
              )}
            </p>
            <FieldError id={eid('priceSar')} message={fieldErrorMessage(fields.priceSar, copy)} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-bookingCutoffHours" className="text-sm font-medium">
              {copy.bookingCutoffLabel}
            </label>
            <select
              id="ex-bookingCutoffHours"
              name="bookingCutoffHours"
              defaultValue={
                v?.bookingCutoffHours ??
                experience.bookingCutoffHours ??
                DEFAULT_BOOKING_CUTOFF_HOURS
              }
              className={SELECT_CLASS}
            >
              {copy.bookingCutoffOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-sarat-black-600 text-sm">{copy.bookingCutoffHint}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-maxGroupSize" className="text-sm font-medium">
              {copy.groupSizeLabel}
            </label>
            <Input
              id="ex-maxGroupSize"
              name="maxGroupSize"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              placeholder="8"
              dir="ltr"
              defaultValue={groupDefault}
              onBlur={onBlurCheck('maxGroupSize')}
              aria-invalid={fields.maxGroupSize ? 'true' : undefined}
              aria-describedby={fields.maxGroupSize ? eid('maxGroupSize') : undefined}
            />
            <FieldError
              id={eid('maxGroupSize')}
              message={fieldErrorMessage(fields.maxGroupSize, copy)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-minAge" className="text-sm font-medium">
              {copy.minAgeLabel}
            </label>
            <Input
              id="ex-minAge"
              name="minAge"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              dir="ltr"
              defaultValue={v?.minAge ?? String(experience.minAge)}
              onBlur={onBlurCheck('minAge')}
              aria-invalid={fields.minAge ? 'true' : undefined}
              aria-describedby={fields.minAge ? eid('minAge') : undefined}
            />
            <p className="text-sarat-black-600 text-sm">{copy.minAgeHint}</p>
            <FieldError id={eid('minAge')} message={fieldErrorMessage(fields.minAge, copy)} />
          </div>
        </fieldset>

        {/* ----- Place ----- */}
        <fieldset className="border-sarat-black/8 grid gap-6 [border-top-width:0.5px] pt-12 sm:grid-cols-2">
          <legend className="sr-only">{copy.sectionPlace}</legend>
          <p aria-hidden className={cn(sectionClassName, 'sm:col-span-2')}>
            {copy.sectionPlace}
          </p>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="ex-placeName" className="text-sm font-medium">
              {copy.placeNameLabel}
            </label>
            <Input
              id="ex-placeName"
              name="placeName"
              // `auto` not `ltr`: canonically English, but a pasted Arabic
              // place string should still read correctly while typed.
              dir="auto"
              maxLength={120}
              placeholder={copy.placeNameHint}
              defaultValue={placeNameDefault}
              onBlur={onBlurCheck('placeName')}
              aria-invalid={fields.placeName ? 'true' : undefined}
              aria-describedby={fields.placeName ? eid('placeName') : undefined}
            />
            <FieldError id={eid('placeName')} message={fieldErrorMessage(fields.placeName, copy)} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-city" className="text-sm font-medium">
              {copy.cityLabel}
            </label>
            <select
              id="ex-city"
              name="city"
              defaultValue={cityDefault}
              className={SELECT_CLASS}
              onChange={(e) => {
                const picked = cityChoices.find((o) => o.nameEn === e.target.value);
                if (picked) setRegion(picked.region);
              }}
            >
              {cityChoices.map((o) => (
                <option key={o.nameEn} value={o.nameEn}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-region" className="text-sm font-medium">
              {copy.regionLabel}
            </label>
            {/* Derived from the picked city (registry canonical, English).
                The visible field localizes the display for Arabic hosts; the
                hidden input keeps the canonical value the DB and the
                seed-content dictionary key on. */}
            <input type="hidden" name="region" value={region} />
            <Input
              id="ex-region"
              readOnly
              className="bg-mist"
              value={locale === 'ar' ? toArabicText(region) : region}
            />
          </div>

          <LocationPicker
            // A draft starts with NO pin (audit P1-2) — the map centres on
            // Abha but nothing submits until the host places the point.
            defaultLat={pinSet ? Number(v?.lat ?? experience.lat) : null}
            defaultLng={pinSet ? Number(v?.lng ?? experience.lng) : null}
            onChange={() => setDirty(true)}
            latError={fieldErrorMessage(fields.lat, copy)}
            lngError={fieldErrorMessage(fields.lng, copy)}
            latErrorId={eid('lat')}
            lngErrorId={eid('lng')}
            copy={{
              latLabel: copy.latLabel,
              lngLabel: copy.lngLabel,
              coordsHint: copy.coordsHint,
              pasteLabel: copy.coordsPasteLabel,
              pastePlaceholder: copy.coordsPastePlaceholder,
              pasteInvalid: copy.coordsPasteInvalid,
              previewTitle: copy.coordsPreviewTitle,
              searchLabel: copy.mapSearchLabel,
              searchPlaceholder: copy.mapSearchPlaceholder,
              searchButton: copy.mapSearchButton,
              searchNotFound: copy.mapSearchNotFound,
              mapHint: copy.mapHint,
              mapUnsetHint: copy.mapUnsetHint,
              manualCoordsLabel: copy.manualCoordsLabel,
            }}
          />
        </fieldset>

        {/* ----- What's included ----- */}
        <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
          <legend className="sr-only">{copy.sectionDetail}</legend>
          <p aria-hidden className={sectionClassName}>
            {copy.sectionDetail}
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="ex-inclusionsRaw" className="text-sm font-medium">
                {copy.inclusionsLabel}
              </label>
              <textarea
                id="ex-inclusionsRaw"
                name="inclusionsRaw"
                dir="auto"
                rows={4}
                defaultValue={inclusionsDefault}
                placeholder={copy.inclusionsPlaceholder}
                className={TEXTAREA_CLASS}
                aria-invalid={fields.inclusionsRaw ? 'true' : undefined}
                aria-describedby={fields.inclusionsRaw ? eid('inclusionsRaw') : undefined}
              />
              <p className="text-sarat-black-600 text-sm">{copy.inclusionsHint}</p>
              <FieldError
                id={eid('inclusionsRaw')}
                message={fieldErrorMessage(fields.inclusionsRaw, copy)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ex-inclusionsArRaw" className="text-sm font-medium">
                {copy.inclusionsArLabel}
              </label>
              <textarea
                id="ex-inclusionsArRaw"
                name="inclusionsArRaw"
                dir="rtl"
                rows={4}
                defaultValue={inclusionsArDefault}
                placeholder={copy.inclusionsArPlaceholder}
                className={TEXTAREA_CLASS}
              />
              <p className="text-sarat-black-600 text-sm">{copy.arOptionalHint}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="ex-whatToBringRaw" className="text-sm font-medium">
                {copy.whatToBringLabel}
              </label>
              <textarea
                id="ex-whatToBringRaw"
                name="whatToBringRaw"
                dir="auto"
                rows={4}
                defaultValue={whatToBringDefault}
                placeholder={copy.whatToBringPlaceholder}
                className={TEXTAREA_CLASS}
              />
              <p className="text-sarat-black-600 text-sm">{copy.whatToBringHint}</p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ex-whatToBringArRaw" className="text-sm font-medium">
                {copy.whatToBringArLabel}
              </label>
              <textarea
                id="ex-whatToBringArRaw"
                name="whatToBringArRaw"
                dir="rtl"
                rows={4}
                defaultValue={whatToBringArDefault}
                placeholder={copy.whatToBringArPlaceholder}
                className={TEXTAREA_CLASS}
              />
              <p className="text-sarat-black-600 text-sm">{copy.arOptionalHint}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ex-cancellationTier" className="text-sm font-medium">
              {copy.cancellationLabel}
            </label>
            {/* Preset tiers only — the selected tier is what guests see on
                the listing and what each booking snapshots and enforces.
                Options carry the short names; the full terms of the CURRENT
                selection render below, where they can't be clipped by the
                closed select (the one-line descriptions overflow it at
                every viewport width). */}
            <select
              id="ex-cancellationTier"
              name="cancellationTier"
              value={tier}
              onChange={(e) => setTier(e.target.value as 'flexible' | 'moderate' | 'strict')}
              className={SELECT_CLASS}
            >
              <option value="flexible">{copy.cancellationTierNames.flexible}</option>
              <option value="moderate">{copy.cancellationTierNames.moderate}</option>
              <option value="strict">{copy.cancellationTierNames.strict}</option>
            </select>
            <p className="text-sarat-black text-sm leading-relaxed">
              {copy.cancellationTiers[tier]}
            </p>
            <p className="text-sarat-black-600 text-sm">{copy.cancellationHint}</p>
          </div>
        </fieldset>

        {/* ----- Availability ----- */}
        <fieldset className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-12">
          <legend className="sr-only">{copy.sectionAvailability}</legend>
          <p aria-hidden className={cn(sectionClassName, 'mb-3')}>
            {copy.sectionAvailability}
          </p>
          <p className="text-sm font-medium">{copy.weekdaysLabel}</p>
          <div className="flex flex-wrap gap-2">
            {copy.weekdays.map((day, idx) => {
              const checked = weekdaysDefault.has(String(idx));
              return (
                <label
                  key={idx}
                  className={cn(
                    'rounded-button border-sarat-black/20 inline-flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
                    'text-sarat-black hover:border-sarat-black/40',
                    // Style from the live :checked state, not the initial
                    // value — a className branch on `defaultChecked` never
                    // updates when the host toggles a day.
                    'has-[:checked]:bg-sarat-black has-[:checked]:border-sarat-black has-[:checked]:text-white',
                    // The checkbox is sr-only, so the global focus ring lands
                    // on an invisible element — mirror it on the chip.
                    'has-[:focus-visible]:shadow-[0_0_0_2px_var(--color-white),0_0_0_4px_rgb(10_10_10_/_0.55)]',
                    'has-[:disabled]:cursor-default has-[:disabled]:opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    name="availabilityWeekdays"
                    value={String(idx)}
                    defaultChecked={checked}
                    className="sr-only"
                  />
                  {day}
                </label>
              );
            })}
          </div>
          <p className="text-sarat-black-600 text-sm">{copy.weekdaysHint}</p>
        </fieldset>
      </fieldset>

      {formError && (
        <p
          ref={formErrorRef}
          role="alert"
          tabIndex={-1}
          className="text-al-qatt-red-800 text-sm focus:outline-none"
        >
          {formError}
        </p>
      )}

      {/* Save bar — sticks to the viewport bottom once anything changed
          (audit P1-6: the button used to sit at the end of ~8 mobile
          screens with nothing signalling pending edits). */}
      {!locked && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-4 gap-y-2 transition-[box-shadow,background-color] duration-200',
            dirty &&
              'border-sarat-black/8 rounded-card sticky bottom-4 z-10 [border-width:0.5px] bg-white/95 p-4 shadow-[0_8px_32px_rgb(10_10_10_/_0.08)] backdrop-blur',
          )}
        >
          <SubmitButton label={copy.submitEdit} pendingLabel={copy.submitEditPending} />
          {dirty && (
            <p role="status" className="text-sarat-black-600 text-sm">
              <span className="text-sarat-black font-medium">{copy.unsaved}</span>
              {isPublic && <> · {copy.unsavedReviewNote}</>}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
