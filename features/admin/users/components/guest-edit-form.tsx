'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { updateGuestProfile } from '@/features/admin/users/actions';
import type { AdminUserEditState, AdminUserGuestFacet } from '@/features/admin/users/types';

export interface GuestEditFormCopy {
  toggle: string;
  name: string;
  email: string;
  phone: string;
  language: string;
  billing: string;
  street1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  save: string;
  saving: string;
  saved: string;
  /** Inline message under a field that failed validation. */
  fieldInvalid: string;
  errors: Record<NonNullable<AdminUserEditState['message']>, string>;
}

export interface GuestEditFormProps {
  personKey: string;
  guest: AdminUserGuestFacet;
  copy: GuestEditFormCopy;
}

const initialState: AdminUserEditState = { success: false };
const LANGS = ['ar', 'en'] as const;

function Submit({ copy }: { copy: GuestEditFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending} className="self-start">
      {pending ? copy.saving : copy.save}
    </Button>
  );
}

function Field({
  label,
  name,
  defaultValue,
  error,
  dir,
  type,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue: string;
  /** Inline validation message; presence marks the field invalid. */
  error?: string;
  dir?: 'ltr';
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        dir={dir}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function GuestEditForm({ personKey, guest, copy }: GuestEditFormProps) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateGuestProfile, initialState);
  const langId = useId();

  useEffect(() => {
    if (state.success) toast({ title: copy.saved, tone: 'success' });
  }, [state, copy.saved]);

  // A failed submit echoes the typed values back; prefer them over the row.
  const v = state.success ? undefined : state.values;
  const fieldError = (name: string) => (state.fields?.[name] ? copy.fieldInvalid : undefined);
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
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={copy.name}
              name="name"
              defaultValue={v?.name ?? guest.name}
              error={fieldError('name')}
              maxLength={80}
            />
            <Field
              label={copy.email}
              name="email"
              type="email"
              dir="ltr"
              defaultValue={v?.email ?? guest.email ?? ''}
              error={fieldError('email')}
              maxLength={160}
            />
            <Field
              label={copy.phone}
              name="phone"
              dir="ltr"
              defaultValue={v?.phone ?? guest.phone ?? ''}
              error={fieldError('phone')}
              maxLength={16}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{copy.language}</legend>
              <div className="flex gap-2" id={langId}>
                {LANGS.map((value) => (
                  <label
                    key={value}
                    className="border-sarat-black/15 rounded-input has-[:checked]:border-sarat-black has-[:checked]:bg-sarat-black flex min-h-11 flex-1 cursor-pointer items-center justify-center [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200 has-[:checked]:text-white"
                  >
                    <input
                      type="radio"
                      name="preferredLanguage"
                      value={value}
                      defaultChecked={(v?.preferredLanguage ?? guest.preferredLanguage) === value}
                      className="sr-only"
                    />
                    {value.toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="border-sarat-black/8 rounded-card flex flex-col gap-5 [border-width:0.5px] p-5">
            <legend className="text-sarat-black-600 px-2 text-[11px] font-medium tracking-[0.2em] uppercase">
              {copy.billing}
            </legend>
            <Field
              label={copy.street1}
              name="billingStreet1"
              defaultValue={v?.billingStreet1 ?? guest.billing.street1 ?? ''}
              error={fieldError('billingStreet1')}
              maxLength={160}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={copy.city}
                name="billingCity"
                defaultValue={v?.billingCity ?? guest.billing.city ?? ''}
                error={fieldError('billingCity')}
                maxLength={80}
              />
              <Field
                label={copy.state}
                name="billingState"
                defaultValue={v?.billingState ?? guest.billing.state ?? ''}
                error={fieldError('billingState')}
                maxLength={80}
              />
              <Field
                label={copy.postcode}
                name="billingPostcode"
                defaultValue={v?.billingPostcode ?? guest.billing.postcode ?? ''}
                error={fieldError('billingPostcode')}
                maxLength={20}
              />
              <Field
                label={copy.country}
                name="billingCountry"
                dir="ltr"
                defaultValue={v?.billingCountry ?? guest.billing.country ?? ''}
                error={fieldError('billingCountry')}
                maxLength={2}
              />
            </div>
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
