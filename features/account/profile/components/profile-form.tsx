'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import { localeLabel } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProfile } from '@/features/account/profile/actions';
import type {
  GuestProfile,
  ProfileErrorKey,
  ProfileFormState,
} from '@/features/account/profile/types';

export interface ProfileFormCopy {
  nameLabel: string;
  emailLabel: string;
  emailOptional: string;
  phoneLabel: string;
  phoneHint: string;
  languageLabel: string;
  submit: string;
  submitting: string;
  saved: string;
  nameError: string;
  emailError: string;
  errors: Record<ProfileErrorKey, string>;
}

export interface ProfileFormProps {
  profile: GuestProfile;
  copy: ProfileFormCopy;
}

const initialState: ProfileFormState = { status: 'idle' };

function Submit({ copy }: { copy: ProfileFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="self-start">
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

export function ProfileForm({ profile, copy }: ProfileFormProps) {
  const [state, action] = useActionState(updateProfile, initialState);
  const nameId = useId();
  const emailId = useId();
  const langId = useId();

  const errored = state.status === 'error' ? state : undefined;
  const nameError = errored?.fields?.name ? copy.nameError : undefined;
  const emailError = errored?.fields?.email ? copy.emailError : undefined;
  const generalError =
    errored && errored.message !== 'validation' ? copy.errors[errored.message] : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
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
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        {nameError && (
          <p id={`${nameId}-error`} className="text-al-qatt-red text-sm">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="flex items-baseline gap-2 text-sm font-medium">
          {copy.emailLabel}
          <span className="text-sarat-black-600 text-xs font-normal">{copy.emailOptional}</span>
        </label>
        <Input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          defaultValue={errored?.values?.email ?? profile.email ?? ''}
          maxLength={160}
          autoComplete="email"
          dir="ltr"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
        />
        {emailError && (
          <p id={`${emailId}-error`} className="text-al-qatt-red text-sm">
            {emailError}
          </p>
        )}
      </div>

      {/* Phone is the immutable KSA identifier (BRIEF §8) — shown read-only,
          LTR-isolated so +966 reads correctly inside an RTL form. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{copy.phoneLabel}</span>
        <p className="text-sarat-black-600 text-base" dir="ltr">
          {profile.phone}
        </p>
        <p className="text-sarat-black-600 text-xs">{copy.phoneHint}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{copy.languageLabel}</legend>
        <div className="flex gap-3" id={langId}>
          {(['ar', 'en'] as const).map((value) => (
            <label
              key={value}
              className="border-sarat-black/20 rounded-input has-[:checked]:border-sarat-black has-[:checked]:bg-sarat-black has-[:checked]:text-fog-white flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 transition-colors duration-200"
            >
              <input
                type="radio"
                name="preferredLanguage"
                value={value}
                defaultChecked={
                  (errored?.values?.preferredLanguage ?? profile.preferredLanguage) === value
                }
                className="sr-only"
              />
              {localeLabel[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {generalError && (
        <p className="text-al-qatt-red text-sm" role="alert">
          {generalError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Submit copy={copy} />
        {state.status === 'success' && (
          <p
            className="text-juniper-green-800 inline-flex items-center gap-1.5 text-sm"
            role="status"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            {copy.saved}
          </p>
        )}
      </div>
    </form>
  );
}
