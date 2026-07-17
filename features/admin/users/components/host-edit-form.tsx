'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { updateHostProfile } from '@/features/admin/users/actions';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';
import type { AdminUserEditState } from '@/features/admin/users/types';

export interface HostEditFormCopy {
  toggle: string;
  name: string;
  bioEn: string;
  bioAr: string;
  contactEmail: string;
  city: string;
  region: string;
  languages: string;
  nationalId: string;
  crNumber: string;
  payoutIban: string;
  identityHint: string;
  save: string;
  saving: string;
  saved: string;
  /** Inline message under a field that failed validation. */
  fieldInvalid: string;
  errors: Record<NonNullable<AdminUserEditState['message']>, string>;
}

export interface HostEditFormProps {
  personKey: string;
  /** The un-masked host facet — supplies the raw current field values. */
  host: {
    name: string;
    bioEn: string;
    bioAr: string;
    contactEmail: string | null;
    city: string;
    region: string;
    languages: readonly string[];
    nationalId: string | null;
    crNumber: string | null;
    payoutIban: string | null;
  };
  copy: HostEditFormCopy;
}

const initialState: AdminUserEditState = { success: false };

const textareaClass = cn(
  'rounded-input border-sarat-black/20 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
  'placeholder:text-sarat-black-600',
);

function Submit({ copy }: { copy: HostEditFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending} className="self-start">
      {pending ? copy.saving : copy.save}
    </Button>
  );
}

export function HostEditForm({ personKey, host, copy }: HostEditFormProps) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateHostProfile, initialState);
  const nameId = useId();
  const bioEnId = useId();
  const bioArId = useId();

  useEffect(() => {
    if (state.success) toast({ title: copy.saved, tone: 'success' });
  }, [state, copy.saved]);

  // A failed submit echoes the typed values back; prefer them over the row.
  const v = state.success ? undefined : state.values;
  const fieldErr = (name: string) => Boolean(state.fields?.[name]);
  const fieldError = (name: string) =>
    fieldErr(name) ? (
      <p role="alert" className="text-al-qatt-red-800 text-sm">
        {copy.fieldInvalid}
      </p>
    ) : null;
  // Every failure renders SOMETHING here — excluding 'validation' made a
  // rejected save silently revert with no visible message.
  const generalError = !state.success && state.message ? copy.errors[state.message] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
      >
        <ChevronDown
          className={cn('size-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
        {copy.toggle}
      </button>

      {open && (
        <form action={action} className="flex flex-col gap-6">
          <input type="hidden" name="key" value={personKey} />

          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium">
              {copy.name}
            </label>
            <Input
              id={nameId}
              name="name"
              defaultValue={v?.name ?? host.name}
              maxLength={80}
              aria-invalid={fieldErr('name') ? true : undefined}
            />
            {fieldError('name')}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={bioEnId} className="text-sm font-medium">
              {copy.bioEn}
            </label>
            <textarea
              id={bioEnId}
              name="bioEn"
              rows={5}
              maxLength={1200}
              dir="ltr"
              defaultValue={v?.bioEn ?? host.bioEn}
              className={textareaClass}
              aria-invalid={fieldErr('bioEn') ? true : undefined}
            />
            {fieldError('bioEn')}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={bioArId} className="text-sm font-medium">
              {copy.bioAr}
            </label>
            <textarea
              id={bioArId}
              name="bioAr"
              rows={5}
              maxLength={1200}
              dir="rtl"
              lang="ar"
              defaultValue={v?.bioAr ?? host.bioAr}
              className={textareaClass}
              aria-invalid={fieldErr('bioAr') ? true : undefined}
            />
            {fieldError('bioAr')}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{copy.contactEmail}</label>
              <Input
                name="contactEmail"
                type="email"
                dir="ltr"
                defaultValue={v?.contactEmail ?? host.contactEmail ?? ''}
                maxLength={160}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{copy.city}</label>
              <Input
                name="city"
                defaultValue={v?.city ?? host.city}
                maxLength={80}
                aria-invalid={fieldErr('city') ? true : undefined}
              />
              {fieldError('city')}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{copy.region}</label>
              <Input name="region" defaultValue={v?.region ?? host.region} maxLength={80} />
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{copy.languages}</legend>
            <div className="flex flex-wrap gap-2">
              {HOST_LANGUAGE_OPTIONS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'rounded-button border-sarat-black/20 inline-flex min-h-11 cursor-pointer items-center [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
                    'has-[:checked]:bg-sarat-black has-[:checked]:border-sarat-black has-[:checked]:text-white',
                  )}
                >
                  <input
                    type="checkbox"
                    name="languages"
                    value={value}
                    defaultChecked={
                      (state.success ? undefined : state.valuesLanguages)?.includes(value) ??
                      host.languages.includes(value)
                    }
                    className="sr-only"
                  />
                  {value.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="border-sarat-black/8 rounded-card flex flex-col gap-5 [border-width:0.5px] p-5">
            <legend className="text-sarat-black-600 px-2 text-[11px] tracking-[0.2em] uppercase">
              KYC
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">{copy.nationalId}</label>
                <Input
                  name="nationalId"
                  dir="ltr"
                  defaultValue={v?.nationalId ?? host.nationalId ?? ''}
                  maxLength={15}
                  aria-invalid={fieldErr('nationalId') ? true : undefined}
                />
                {fieldError('nationalId')}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">{copy.crNumber}</label>
                <Input
                  name="crNumber"
                  dir="ltr"
                  defaultValue={v?.crNumber ?? host.crNumber ?? ''}
                  maxLength={15}
                  aria-invalid={fieldErr('crNumber') ? true : undefined}
                />
                {fieldError('crNumber')}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{copy.payoutIban}</label>
              <Input
                name="payoutIban"
                dir="ltr"
                defaultValue={v?.payoutIban ?? host.payoutIban ?? ''}
                maxLength={40}
                aria-invalid={fieldErr('payoutIban') ? true : undefined}
              />
              {fieldError('payoutIban')}
            </div>
            <p className="text-sarat-black-600 text-sm">{copy.identityHint}</p>
          </fieldset>

          {generalError && (
            <p className="text-al-qatt-red text-sm" role="alert">
              {generalError}
            </p>
          )}
          <Submit copy={copy} />
        </form>
      )}
    </div>
  );
}
