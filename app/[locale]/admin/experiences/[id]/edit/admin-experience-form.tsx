'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminUpdateExperience,
  type AdminExperienceEditState,
} from '@/features/admin/experiences/actions';
import type { AdminExperienceEdit } from '@/features/admin/experiences/queries';

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
  blackoutDates: string;
  blackoutDatesHint: string;
  submit: string;
  pending: string;
  fieldInvalid: string;
  formValidation: string;
  formServer: string;
  formNotFound: string;
  formForbidden: string;
  weekdays: string[];
  categories: Option[];
  statuses: Option[];
  modes: Option[];
}

export interface AdminExperienceFormProps {
  locale: Locale;
  experience: AdminExperienceEdit;
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
    <Button type="submit" variant="primary" size="lg" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminExperienceForm({ locale, experience, copy }: AdminExperienceFormProps) {
  const [state, formAction] = useActionState(adminUpdateExperience, initialState);
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

  const weekdaySet = new Set(experience.availabilityWeekdays);
  const commissionPct = (experience.commissionBps / 100).toString();

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
      <input type="hidden" name="experienceId" value={experience.id} />

      {/* Publishing & commercial */}
      <fieldset className="flex flex-col gap-6">
        <legend className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.sectionPublishing}
        </legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-status" className={labelClass}>
              {copy.status}
            </label>
            <select
              id="ex-status"
              name="status"
              defaultValue={experience.status}
              className={SELECT_CLASS}
            >
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
              defaultValue={experience.bookingMode}
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
              defaultValue={experience.startTime}
              {...aria('startTime')}
            />
            {err('startTime')}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={experience.featured}
            className="size-5"
          />
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
            <Input
              id="ex-titleEn"
              name="titleEn"
              defaultValue={experience.titleEn}
              {...aria('titleEn')}
            />
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
              defaultValue={experience.titleAr}
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
            defaultValue={experience.descriptionEn}
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
            defaultValue={experience.descriptionAr}
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
            defaultValue={experience.category}
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
              defaultValue={experience.durationMinutes}
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
              defaultValue={experience.maxGroupSize}
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
              defaultValue={experience.minAge}
              {...aria('minAge')}
            />
            {err('minAge')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-price" className={labelClass}>
              {copy.priceSar}
            </label>
            <Input
              id="ex-price"
              name="priceSar"
              type="number"
              min={0}
              defaultValue={experience.priceSar}
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
              defaultValue={experience.placeName}
              {...aria('placeName')}
            />
            {err('placeName')}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-city" className={labelClass}>
              {copy.city}
            </label>
            <Input id="ex-city" name="city" defaultValue={experience.city} {...aria('city')} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ex-region" className={labelClass}>
              {copy.region}
            </label>
            <Input
              id="ex-region"
              name="region"
              defaultValue={experience.region}
              {...aria('region')}
            />
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
            defaultValue={experience.inclusions.join('\n')}
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
            defaultValue={experience.whatToBring.join('\n')}
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
            defaultValue={experience.cancellationPolicy}
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
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-blackout" className={labelClass}>
            {copy.blackoutDates}
          </label>
          <textarea
            id="ex-blackout"
            name="blackoutDatesRaw"
            rows={3}
            dir="ltr"
            defaultValue={experience.blackoutDates.join('\n')}
            className={TEXTAREA_CLASS}
            {...aria('blackoutDatesRaw')}
          />
          <p className={hintClass}>{copy.blackoutDatesHint}</p>
          {err('blackoutDatesRaw')}
        </div>
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
