'use client';

import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { updateHostProfile } from '@/features/host-profile/actions';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';
import type { HostProfileErrorKey, HostProfileFormState } from '@/features/host-profile/types';

export interface HostProfileFormCopy {
  nameLabel: string;
  nameHint: string;
  bioLabel: string;
  bioHint: string;
  arabicNote: string;
  languagesLabel: string;
  /** Display label per offered language code. */
  languageLabels: Record<(typeof HOST_LANGUAGE_OPTIONS)[number], string>;
  submit: string;
  submitting: string;
  saved: string;
  nameError: string;
  bioError: string;
  languagesError: string;
  errors: Record<HostProfileErrorKey, string>;
}

export interface HostProfileFormProps {
  profile: { name: string; bioEn: string; languages: readonly string[] };
  copy: HostProfileFormCopy;
}

const initialState: HostProfileFormState = { status: 'idle' };

function Submit({ copy }: { copy: HostProfileFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="self-start">
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

/**
 * Edits the host-authored public fields — name, English bio, languages.
 * Same chassis as the guest ProfileForm: server action via
 * `useActionState`, inline field errors, success toast. The language
 * chips are uncontrolled checkboxes styled through `has-[:checked]`,
 * matching the preferred-language picker on the guest form.
 */
export function HostProfileForm({ profile, copy }: HostProfileFormProps) {
  const [state, action] = useActionState(updateHostProfile, initialState);
  const nameId = useId();
  const bioId = useId();
  const langId = useId();

  // Save feedback springs in as a toast; useActionState returns a fresh
  // state object per submit, so repeat saves re-fire.
  useEffect(() => {
    if (state.status === 'success') toast({ title: copy.saved, tone: 'success' });
  }, [state, copy.saved]);

  const errored = state.status === 'error' ? state : undefined;
  const nameError = errored?.fields?.name ? copy.nameError : undefined;
  const bioError = errored?.fields?.bioEn ? copy.bioError : undefined;
  const languagesError = errored?.fields?.languages ? copy.languagesError : undefined;
  const generalError =
    errored && errored.message !== 'validation' ? copy.errors[errored.message] : undefined;

  const selectedLanguages = errored?.values?.languages ?? profile.languages;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium">
          {copy.nameLabel}
        </label>
        <Input
          id={nameId}
          name="name"
          defaultValue={errored?.values?.name ?? profile.name}
          required
          maxLength={80}
          autoComplete="name"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : `${nameId}-hint`}
        />
        {nameError ? (
          <p id={`${nameId}-error`} className="text-al-qatt-red text-sm">
            {nameError}
          </p>
        ) : (
          <p id={`${nameId}-hint`} className="text-sarat-black-600 text-sm">
            {copy.nameHint}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={bioId} className="text-sm font-medium">
          {copy.bioLabel}
        </label>
        <textarea
          id={bioId}
          name="bioEn"
          rows={6}
          required
          minLength={40}
          maxLength={1200}
          defaultValue={errored?.values?.bioEn ?? profile.bioEn}
          // The bio is authored in English (the team translates Arabic
          // out-of-band), so keep it LTR inside the RTL layout.
          dir="ltr"
          className={cn(
            'rounded-input border-sarat-black/20 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
            'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
          )}
          aria-invalid={bioError ? true : undefined}
          aria-describedby={bioError ? `${bioId}-error` : `${bioId}-hint`}
        />
        {bioError ? (
          <p id={`${bioId}-error`} className="text-al-qatt-red text-sm">
            {bioError}
          </p>
        ) : (
          <p id={`${bioId}-hint`} className="text-sarat-black-600 text-sm">
            {copy.bioHint}
          </p>
        )}
        <p className="text-sarat-black-600 text-xs">{copy.arabicNote}</p>
      </div>

      <div className="flex flex-col gap-2">
        <fieldset>
          <legend className="text-sm font-medium">{copy.languagesLabel}</legend>
          <div
            className="mt-3 flex flex-wrap gap-2"
            id={langId}
            aria-describedby={languagesError ? `${langId}-error` : undefined}
          >
            {HOST_LANGUAGE_OPTIONS.map((value) => (
              <label
                key={value}
                className={cn(
                  'rounded-button border-sarat-black/20 inline-flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
                  'text-sarat-black hover:border-sarat-black/40',
                  'has-[:checked]:bg-sarat-black has-[:checked]:border-sarat-black has-[:checked]:text-white',
                )}
              >
                <input
                  type="checkbox"
                  name="languages"
                  value={value}
                  defaultChecked={selectedLanguages.includes(value)}
                  className="sr-only"
                />
                {copy.languageLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        {languagesError && (
          <p id={`${langId}-error`} className="text-al-qatt-red text-sm">
            {languagesError}
          </p>
        )}
      </div>

      {generalError && (
        <p className="text-al-qatt-red text-sm" role="alert">
          {generalError}
        </p>
      )}

      <div className="border-sarat-black/8 flex items-center gap-3 [border-top-width:0.5px] pt-5">
        <Submit copy={copy} />
      </div>
    </form>
  );
}
