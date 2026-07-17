'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationPicker } from '@/features/host-experiences/components/location-picker';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  createDraftExperience,
  updateHostExperience,
  type HostExperienceState,
} from '@/features/host-experiences/actions';
import {
  DEFAULT_BOOKING_CUTOFF_HOURS,
  EXPERIENCE_CATEGORIES,
} from '@/features/host-experiences/schemas';
import type { HostExperienceRow } from '@/features/host-experiences/queries';

/**
 * The form is identical for create and edit — same fields, same validation,
 * same shape on submit. The page picks the action and supplies the optional
 * pre-fill. Every visible string is supplied via `copy` so the file owns
 * zero UI text (CLAUDE.md: never hardcode user-facing strings).
 *
 * `copy.errors.fields` is keyed by the zod issue messages the action
 * surfaces (`title_short`, `description_long`, …). The action emits
 * snake_case codes; we map them through `FIELD_ERROR_KEY` here so the
 * call site sees plain camelCase translation keys.
 */

type FieldErrorCode =
  | 'title_short'
  | 'title_long'
  | 'description_short'
  | 'description_long'
  | 'duration_short'
  | 'duration_long'
  | 'price_negative'
  | 'price_too_high'
  | 'policy_short'
  | 'policy_long'
  | 'time_invalid'
  | 'coords_invalid'
  | 'group_invalid'
  | 'age_invalid'
  | 'required';

const FIELD_ERROR_KEY: Record<FieldErrorCode, keyof ExperienceFormCopy['errors']['fields']> = {
  title_short: 'titleShort',
  title_long: 'titleLong',
  description_short: 'descriptionShort',
  description_long: 'descriptionLong',
  duration_short: 'durationShort',
  duration_long: 'durationLong',
  price_negative: 'priceNegative',
  price_too_high: 'priceTooHigh',
  policy_short: 'policyShort',
  policy_long: 'policyLong',
  time_invalid: 'timeInvalid',
  coords_invalid: 'coordsInvalid',
  group_invalid: 'groupInvalid',
  age_invalid: 'ageInvalid',
  required: 'required',
};

type FormMessageKey = 'validation' | 'server' | 'forbidden' | 'notFound' | 'noDb' | 'cannotPublish';

const FORM_MESSAGE_KEY: Partial<
  Record<NonNullable<HostExperienceState['message']>, FormMessageKey>
> = {
  validation: 'validation',
  server: 'server',
  forbidden: 'forbidden',
  not_found: 'notFound',
  no_db: 'noDb',
  cannot_publish: 'cannotPublish',
};

export interface ExperienceFormCopy {
  sectionBasics: string;
  sectionPracticalities: string;
  sectionPlace: string;
  sectionDetail: string;
  sectionAvailability: string;
  titleLabel: string;
  titleHint: string;
  descriptionLabel: string;
  descriptionHint: string;
  categoryLabel: string;
  durationLabel: string;
  priceLabel: string;
  groupSizeLabel: string;
  minAgeLabel: string;
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
  manualCoordsLabel: string;
  cityLabel: string;
  regionLabel: string;
  inclusionsLabel: string;
  inclusionsPlaceholder: string;
  inclusionsHint: string;
  whatToBringLabel: string;
  whatToBringPlaceholder: string;
  whatToBringHint: string;
  cancellationLabel: string;
  cancellationPlaceholder: string;
  weekdaysLabel: string;
  weekdaysHint: string;
  /** Sun..Sat order, matching `availabilityWeekdays` index 0..6. */
  weekdays: readonly [string, string, string, string, string, string, string];
  /** Category labels keyed by the same enum value as `EXPERIENCE_CATEGORIES`. */
  categories: Record<(typeof EXPERIENCE_CATEGORIES)[number], string>;
  submitCreate: string;
  submitCreatePending: string;
  submitEdit: string;
  submitEditPending: string;
  errors: {
    validation: string;
    server: string;
    forbidden: string;
    notFound: string;
    noDb: string;
    cannotPublish: string;
    fields: {
      titleShort: string;
      titleLong: string;
      descriptionShort: string;
      descriptionLong: string;
      durationShort: string;
      durationLong: string;
      priceNegative: string;
      priceTooHigh: string;
      policyShort: string;
      policyLong: string;
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
  mode: 'create' | 'edit';
  locale: Locale;
  copy: ExperienceFormCopy;
  experience?: HostExperienceRow;
  /** Enabled operating cities (admin catalog registry). */
  cityOptions: readonly ExperienceFormCityOption[];
}

const initialState: HostExperienceState = { success: false };

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
);
const SELECT_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base',
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

export function ExperienceForm({
  mode,
  locale,
  copy,
  experience,
  cityOptions,
}: ExperienceFormProps) {
  const action = mode === 'create' ? createDraftExperience : updateHostExperience;
  const [state, formAction] = useActionState(action, initialState);

  // Failed submits echo the raw values back (React 19 resets uncontrolled
  // inputs after a form action) — always prefer the echo over the stored row.
  const v = state.values;

  // City comes from the operating-cities registry. A legacy row whose
  // city predates the registry (or was disabled since) keeps its value
  // as an extra option so editing never silently relocates it.
  const cityDefault = v?.city || (experience?.city ?? cityOptions[0]?.nameEn ?? 'Abha');
  const cityChoices = cityOptions.some((o) => o.nameEn === cityDefault)
    ? cityOptions
    : [
        { nameEn: cityDefault, region: experience?.region ?? 'Aseer', label: cityDefault },
        ...cityOptions,
      ];
  const [region, setRegion] = useState(
    v?.region ||
      (experience?.region ?? cityChoices.find((o) => o.nameEn === cityDefault)?.region ?? 'Aseer'),
  );

  const errorPrefix = useId();
  const eid = (k: string) => `${errorPrefix}-${k}-error`;

  const inclusionsDefault = v?.inclusionsRaw ?? experience?.inclusions.join('\n') ?? '';
  const whatToBringDefault = v?.whatToBringRaw ?? experience?.whatToBring.join('\n') ?? '';
  const weekdaysDefault = new Set(
    v?.availabilityWeekdays ?? (experience?.availabilityWeekdays ?? []).map(String),
  );

  const fields = state.fields ?? {};
  const formError = formMessage(state, copy);

  const submitLabel = mode === 'create' ? copy.submitCreate : copy.submitEdit;
  const submitPendingLabel = mode === 'create' ? copy.submitCreatePending : copy.submitEditPending;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-10">
      <input type="hidden" name="locale" value={locale} />
      {experience && <input type="hidden" name="experienceId" value={experience.id} />}

      {/* ----- Basics ----- */}
      <fieldset className="flex flex-col gap-6">
        <legend className="sr-only">{copy.sectionBasics}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-titleEn" className="text-sm font-medium">
            {copy.titleLabel}
          </label>
          <Input
            id="ex-titleEn"
            name="titleEn"
            required
            minLength={8}
            maxLength={120}
            defaultValue={v?.titleEn ?? experience?.titleEn}
            aria-invalid={fields.titleEn ? 'true' : undefined}
            aria-describedby={fields.titleEn ? eid('titleEn') : undefined}
          />
          <p className="text-sarat-black-600 text-sm">{copy.titleHint}</p>
          <FieldError id={eid('titleEn')} message={fieldErrorMessage(fields.titleEn, copy)} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-descriptionEn" className="text-sm font-medium">
            {copy.descriptionLabel}
          </label>
          <textarea
            id="ex-descriptionEn"
            name="descriptionEn"
            rows={6}
            required
            minLength={60}
            maxLength={4000}
            defaultValue={v?.descriptionEn ?? experience?.descriptionEn}
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
          <label htmlFor="ex-category" className="text-sm font-medium">
            {copy.categoryLabel}
          </label>
          <select
            id="ex-category"
            name="category"
            defaultValue={v?.category ?? experience?.category ?? 'heritage'}
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

      {/* ----- Numbers ----- */}
      <fieldset className="border-sarat-black/8 grid gap-6 [border-top-width:0.5px] pt-10 sm:grid-cols-2">
        <legend className="sr-only">{copy.sectionPracticalities}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-durationMinutes" className="text-sm font-medium">
            {copy.durationLabel}
          </label>
          <Input
            id="ex-durationMinutes"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            min={30}
            max={1440}
            required
            defaultValue={v?.durationMinutes ?? experience?.durationMinutes ?? 120}
            aria-invalid={fields.durationMinutes ? 'true' : undefined}
            aria-describedby={fields.durationMinutes ? eid('durationMinutes') : undefined}
          />
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
            required
            dir="ltr"
            defaultValue={v?.startTime ?? experience?.startTime ?? '09:00'}
            aria-invalid={fields.startTime ? 'true' : undefined}
            aria-describedby={fields.startTime ? eid('startTime') : undefined}
          />
          <p className="text-sarat-black-600 text-sm">{copy.startTimeHint}</p>
          <FieldError id={eid('startTime')} message={fieldErrorMessage(fields.startTime, copy)} />
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
              experience?.bookingCutoffHours ??
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
            required
            defaultValue={v?.priceSar ?? experience?.priceSar ?? 200}
            aria-invalid={fields.priceSar ? 'true' : undefined}
            aria-describedby={fields.priceSar ? eid('priceSar') : undefined}
          />
          <FieldError id={eid('priceSar')} message={fieldErrorMessage(fields.priceSar, copy)} />
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
            required
            defaultValue={v?.maxGroupSize ?? experience?.maxGroupSize ?? 8}
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
            required
            defaultValue={v?.minAge ?? experience?.minAge ?? 0}
            aria-invalid={fields.minAge ? 'true' : undefined}
            aria-describedby={fields.minAge ? eid('minAge') : undefined}
          />
          <FieldError id={eid('minAge')} message={fieldErrorMessage(fields.minAge, copy)} />
        </div>
      </fieldset>

      {/* ----- Place ----- */}
      <fieldset className="border-sarat-black/8 grid gap-6 [border-top-width:0.5px] pt-10 sm:grid-cols-2">
        <legend className="sr-only">{copy.sectionPlace}</legend>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="ex-placeName" className="text-sm font-medium">
            {copy.placeNameLabel}
          </label>
          <Input
            id="ex-placeName"
            name="placeName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={v?.placeName ?? experience?.placeName}
            aria-invalid={fields.placeName ? 'true' : undefined}
            aria-describedby={fields.placeName ? eid('placeName') : undefined}
          />
          <p className="text-sarat-black-600 text-sm">{copy.placeNameHint}</p>
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
          <Input
            id="ex-region"
            name="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>

        <LocationPicker
          defaultLat={experience?.lat ?? 18.2164}
          defaultLng={experience?.lng ?? 42.5053}
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
            manualCoordsLabel: copy.manualCoordsLabel,
          }}
        />
      </fieldset>

      {/* ----- Inclusions / what-to-bring ----- */}
      <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-10">
        <legend className="sr-only">{copy.sectionDetail}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-inclusionsRaw" className="text-sm font-medium">
            {copy.inclusionsLabel}
          </label>
          <textarea
            id="ex-inclusionsRaw"
            name="inclusionsRaw"
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
          <label htmlFor="ex-whatToBringRaw" className="text-sm font-medium">
            {copy.whatToBringLabel}
          </label>
          <textarea
            id="ex-whatToBringRaw"
            name="whatToBringRaw"
            rows={4}
            defaultValue={whatToBringDefault}
            placeholder={copy.whatToBringPlaceholder}
            className={TEXTAREA_CLASS}
          />
          <p className="text-sarat-black-600 text-sm">{copy.whatToBringHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-cancellationPolicy" className="text-sm font-medium">
            {copy.cancellationLabel}
          </label>
          <textarea
            id="ex-cancellationPolicy"
            name="cancellationPolicy"
            rows={3}
            required
            minLength={20}
            maxLength={1000}
            defaultValue={v?.cancellationPolicy ?? experience?.cancellationPolicy}
            placeholder={copy.cancellationPlaceholder}
            className={TEXTAREA_CLASS}
            aria-invalid={fields.cancellationPolicy ? 'true' : undefined}
            aria-describedby={fields.cancellationPolicy ? eid('cancellationPolicy') : undefined}
          />
          <FieldError
            id={eid('cancellationPolicy')}
            message={fieldErrorMessage(fields.cancellationPolicy, copy)}
          />
        </div>
      </fieldset>

      {/* ----- Availability ----- */}
      <fieldset className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-10">
        <legend className="sr-only">{copy.sectionAvailability}</legend>
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

      {formError && (
        <p role="alert" tabIndex={-1} className="text-al-qatt-red-800 text-sm focus:outline-none">
          {formError}
        </p>
      )}

      <div className="flex justify-start">
        <SubmitButton label={submitLabel} pendingLabel={submitPendingLabel} />
      </div>
    </form>
  );
}
