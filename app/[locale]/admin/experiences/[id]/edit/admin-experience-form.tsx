'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import {
  adminCreateExperience,
  adminUpdateExperience,
  type AdminExperienceEditState,
} from '@/features/admin/experiences/actions';
import type { AdminExperienceEdit, HostOption } from '@/features/admin/experiences/queries';

interface Option {
  value: string;
  label: string;
}

export interface AdminExperienceFormCopy {
  sectionPublishing: string;
  sectionBasics: string;
  sectionLogistics: string;
  sectionLists: string;
  sectionAvailability: string;
  status: string;
  featured: string;
  featuredHint: string;
  bookingMode: string;
  bookingModeHint: string;
  commission: string;
  commissionHint: string;
  startTime: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  durationMinutes: string;
  maxGroupSize: string;
  minAge: string;
  priceSar: string;
  placeName: string;
  city: string;
  region: string;
  inclusions: string;
  inclusionsHint: string;
  whatToBring: string;
  whatToBringHint: string;
  cancellationPolicy: string;
  availabilityWeekdays: string;
  /** Note pointing the operator to the calendar for date exceptions. */
  blackoutHint: string;
  submit: string;
  pending: string;
  fieldInvalid: string;
  formValidation: string;
  formServer: string;
  formNotFound: string;
  formForbidden: string;
  /** Create mode only: the owner-host selector label. */
  host?: string;
  weekdays: string[];
  categories: Option[];
  statuses: Option[];
  modes: Option[];
}

/** Blank defaults for create mode — sensible marketplace starting points. */
const BLANK: Omit<AdminExperienceEdit, 'id' | 'slug' | 'heroImage' | 'images'> = {
  titleEn: '',
  titleAr: '',
  descriptionEn: '',
  descriptionAr: '',
  category: 'nature',
  durationMinutes: 120,
  maxGroupSize: 8,
  minAge: 0,
  priceSar: 0,
  placeName: '',
  city: 'Abha',
  region: 'Asir',
  inclusions: [],
  whatToBring: [],
  cancellationPolicy: '',
  availabilityWeekdays: [],
  blackoutDates: [],
  startTime: '09:00',
  bookingMode: 'request',
  commissionBps: 1500,
  status: 'draft',
  featured: false,
};

export interface AdminExperienceFormProps {
  locale: Locale;
  /** 'edit' (default) requires `experience`; 'create' requires `hosts`. */
  mode?: 'create' | 'edit';
  experience?: AdminExperienceEdit;
  hosts?: readonly HostOption[];
  copy: AdminExperienceFormCopy;
}

const initialState: AdminExperienceEditState = { success: false };

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
);
const SELECT_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base',
);

function SubmitButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminExperienceForm({
  locale,
  mode = 'edit',
  experience,
  hosts = [],
  copy,
}: AdminExperienceFormProps) {
  const isCreate = mode === 'create';
  const ex = experience ?? BLANK;
  const [state, formAction] = useActionState(
    isCreate ? adminCreateExperience : adminUpdateExperience,
    initialState,
  );
  const fields = state.fields ?? {};
  const errorPrefix = useId();
  const eid = (k: string) => `${errorPrefix}-${k}`;

  const err = (name: string) =>
    fields[name] ? (
      <p id={eid(name)} className="text-al-qatt-red-800 text-sm">
        {copy.fieldInvalid}
      </p>
    ) : null;
  const aria = (name: string) => ({
    'aria-invalid': fields[name] ? ('true' as const) : undefined,
    'aria-describedby': fields[name] ? eid(name) : undefined,
  });

  const weekdaySet = new Set(ex.availabilityWeekdays);
  const commissionPct = (ex.commissionBps / 100).toString();

  const formError =
    state.message === 'server'
      ? copy.formServer
      : state.message === 'not_found'
        ? copy.formNotFound
        : state.message === 'forbidden'
          ? copy.formForbidden
          : state.message === 'validation'
            ? copy.formValidation
            : undefined;

  const labelClass = 'text-sm font-medium';
  const hintClass = 'text-sarat-black-600 text-sm';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-10">
      <input type="hidden" name="locale" value={locale} />
      {!isCreate && experience && <input type="hidden" name="experienceId" value={experience.id} />}

      {/* Publishing & commercial */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionPublishing}
        </legend>
        {isCreate && (
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-host" className={labelClass}>
              {copy.host}
            </label>
            <select
              id="ex-host"
              name="hostId"
              defaultValue=""
              className={SELECT_CLASS}
              {...aria('hostId')}
            >
              <option value="" disabled>
                —
              </option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            {err('hostId')}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-status" className={labelClass}>
              {copy.status}
            </label>
            <select id="ex-status" name="status" defaultValue={ex.status} className={SELECT_CLASS}>
              {copy.statuses.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-mode" className={labelClass}>
              {copy.bookingMode}
            </label>
            <select
              id="ex-mode"
              name="bookingMode"
              defaultValue={ex.bookingMode}
              className={SELECT_CLASS}
            >
              {copy.modes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={hintClass}>{copy.bookingModeHint}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-commission" className={labelClass}>
              {copy.commission}
            </label>
            <Input
              id="ex-commission"
              name="commissionPct"
              type="number"
              min={0}
              max={50}
              step={0.5}
              defaultValue={commissionPct}
              {...aria('commissionPct')}
            />
            <p className={hintClass}>{copy.commissionHint}</p>
            {err('commissionPct')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-startTime" className={labelClass}>
              {copy.startTime}
            </label>
            <Input
              id="ex-startTime"
              name="startTime"
              type="time"
              defaultValue={ex.startTime}
              {...aria('startTime')}
            />
            {err('startTime')}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="featured" defaultChecked={ex.featured} className="size-5" />
          {copy.featured}
        </label>
        <p className={hintClass}>{copy.featuredHint}</p>
      </fieldset>

      {/* Basics */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionBasics}
        </legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-titleEn" className={labelClass}>
              {copy.titleEn}
            </label>
            <Input id="ex-titleEn" name="titleEn" defaultValue={ex.titleEn} {...aria('titleEn')} />
            {err('titleEn')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-titleAr" className={labelClass}>
              {copy.titleAr}
            </label>
            <Input
              id="ex-titleAr"
              name="titleAr"
              dir="rtl"
              defaultValue={ex.titleAr}
              {...aria('titleAr')}
            />
            {err('titleAr')}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-descEn" className={labelClass}>
            {copy.descriptionEn}
          </label>
          <textarea
            id="ex-descEn"
            name="descriptionEn"
            rows={5}
            defaultValue={ex.descriptionEn}
            className={TEXTAREA_CLASS}
            {...aria('descriptionEn')}
          />
          {err('descriptionEn')}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-descAr" className={labelClass}>
            {copy.descriptionAr}
          </label>
          <textarea
            id="ex-descAr"
            name="descriptionAr"
            rows={5}
            dir="rtl"
            defaultValue={ex.descriptionAr}
            className={TEXTAREA_CLASS}
            {...aria('descriptionAr')}
          />
          {err('descriptionAr')}
        </div>
        <div className="flex flex-col gap-2 sm:max-w-xs">
          <label htmlFor="ex-category" className={labelClass}>
            {copy.category}
          </label>
          <select
            id="ex-category"
            name="category"
            defaultValue={ex.category}
            className={SELECT_CLASS}
          >
            {copy.categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* Logistics */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionLogistics}
        </legend>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-duration" className={labelClass}>
              {copy.durationMinutes}
            </label>
            <Input
              id="ex-duration"
              name="durationMinutes"
              type="number"
              min={30}
              defaultValue={ex.durationMinutes}
              {...aria('durationMinutes')}
            />
            {err('durationMinutes')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-group" className={labelClass}>
              {copy.maxGroupSize}
            </label>
            <Input
              id="ex-group"
              name="maxGroupSize"
              type="number"
              min={1}
              defaultValue={ex.maxGroupSize}
              {...aria('maxGroupSize')}
            />
            {err('maxGroupSize')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-age" className={labelClass}>
              {copy.minAge}
            </label>
            <Input
              id="ex-age"
              name="minAge"
              type="number"
              min={0}
              defaultValue={ex.minAge}
              {...aria('minAge')}
            />
            {err('minAge')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-price" className={labelClass}>
              {copy.priceSar} (<RiyalSymbol className="h-[0.9em] align-[-0.1em]" />)
            </label>
            <Input
              id="ex-price"
              name="priceSar"
              type="number"
              min={0}
              defaultValue={ex.priceSar}
              {...aria('priceSar')}
            />
            {err('priceSar')}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-place" className={labelClass}>
              {copy.placeName}
            </label>
            <Input
              id="ex-place"
              name="placeName"
              defaultValue={ex.placeName}
              {...aria('placeName')}
            />
            {err('placeName')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-city" className={labelClass}>
              {copy.city}
            </label>
            <Input id="ex-city" name="city" defaultValue={ex.city} {...aria('city')} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-region" className={labelClass}>
              {copy.region}
            </label>
            <Input id="ex-region" name="region" defaultValue={ex.region} {...aria('region')} />
          </div>
        </div>
      </fieldset>

      {/* Lists & policy */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionLists}
        </legend>
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-inclusions" className={labelClass}>
            {copy.inclusions}
          </label>
          <textarea
            id="ex-inclusions"
            name="inclusionsRaw"
            rows={4}
            defaultValue={ex.inclusions.join('\n')}
            className={TEXTAREA_CLASS}
          />
          <p className={hintClass}>{copy.inclusionsHint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-bring" className={labelClass}>
            {copy.whatToBring}
          </label>
          <textarea
            id="ex-bring"
            name="whatToBringRaw"
            rows={4}
            defaultValue={ex.whatToBring.join('\n')}
            className={TEXTAREA_CLASS}
          />
          <p className={hintClass}>{copy.whatToBringHint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-cancel" className={labelClass}>
            {copy.cancellationPolicy}
          </label>
          <textarea
            id="ex-cancel"
            name="cancellationPolicy"
            rows={3}
            defaultValue={ex.cancellationPolicy}
            className={TEXTAREA_CLASS}
            {...aria('cancellationPolicy')}
          />
          {err('cancellationPolicy')}
        </div>
      </fieldset>

      {/* Availability */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionAvailability}
        </legend>
        <div className="flex flex-col gap-3">
          <span className={labelClass}>{copy.availabilityWeekdays}</span>
          <div className="flex flex-wrap gap-3">
            {copy.weekdays.map((label, index) => (
              <label
                key={index}
                className="border-sarat-black/20 rounded-button inline-flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm"
              >
                <input
                  type="checkbox"
                  name="availabilityWeekdays"
                  value={index}
                  defaultChecked={weekdaySet.has(index)}
                  className="size-4"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <p className={hintClass}>{copy.blackoutHint}</p>
      </fieldset>

      {formError && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
        </p>
      )}

      <div>
        <SubmitButton label={copy.submit} pending={copy.pending} />
      </div>
    </form>
  );
}
