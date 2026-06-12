'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  submitHostApplication,
  type HostApplyState,
  type HostApplyFieldName,
} from '@/features/host-applications/actions';
import type { HostIdentityType, HostLanguage } from '@/features/host-applications/types';

type ErrorKey =
  | 'validation'
  | 'server'
  | 'authRequired'
  | 'display_name_short'
  | 'display_name_long'
  | 'bio_short'
  | 'bio_long'
  | 'languages_required'
  | 'identity_invalid'
  | 'email_invalid'
  | 'required';

interface HostApplyCopy {
  sectionAbout: string;
  sectionIdentity: string;
  sectionContact: string;
  displayNameLabel: string;
  displayNameHint: string;
  bioLabel: string;
  bioHint: string;
  languagesLabel: string;
  languagesHint: string;
  identityTypeLabel: string;
  identityTypeNationalId: string;
  identityTypeCr: string;
  identityNumberLabel: string;
  identityNumberHint: string;
  contactPhoneLabel: string;
  contactPhoneHint: string;
  contactEmailLabel: string;
  contactEmailHint: string;
  submit: string;
  pending: string;
  errors: Record<ErrorKey, string>;
}

export interface HostApplyFormInitial {
  displayName: string;
  bioEn: string;
  languages: string[];
  identityType: HostIdentityType;
  identityNumber: string;
  contactEmail: string;
  city: string;
  region: string;
}

export interface HostApplyFormProps {
  locale: Locale;
  contactPhone: string;
  initial?: HostApplyFormInitial;
  languageOptions: ReadonlyArray<{ value: HostLanguage; label: string }>;
  copy: HostApplyCopy;
}

const initialState: HostApplyState = { success: false };

const FIELDS_WITH_HINTS: ReadonlySet<HostApplyFieldName> = new Set([
  'displayName',
  'bioEn',
  'languages',
  'identityNumber',
  'contactEmail',
]);

function SubmitButton({ pending: pendingCopy, submit }: { pending: string; submit: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingCopy : submit}
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

function errorMessage(code: string | undefined, copy: HostApplyCopy): string | undefined {
  if (!code) return undefined;
  if (code in copy.errors) return copy.errors[code as ErrorKey];
  return copy.errors.required;
}

export function HostApplyForm({
  locale,
  contactPhone,
  initial,
  languageOptions,
  copy,
}: HostApplyFormProps) {
  const [state, formAction] = useActionState(submitHostApplication, initialState);
  const values = state.values ?? {};
  // Controlled state for the inputs that need it: identity type (drives
  // input mode), language checkboxes (so re-renders preserve ticks),
  // and the longform bio (so the user can see their re-echoed text on
  // a server-side validation bounce).
  const [identityType, setIdentityType] = useState<HostIdentityType>(
    (values.identityType as HostIdentityType | undefined) ?? initial?.identityType ?? 'national_id',
  );
  const [selectedLanguages, setSelectedLanguages] = useState<readonly string[]>(
    () => values.languages ?? initial?.languages ?? ['ar'],
  );

  const formRef = useRef<HTMLFormElement>(null);
  const errorPrefix = useId();
  const errorId = (field: HostApplyFieldName) => `${errorPrefix}-${field}-error`;
  const hintId = (field: HostApplyFieldName) => `${errorPrefix}-${field}-hint`;
  const formErrorId = `${errorPrefix}-form-error`;

  // Move focus to the first invalid field after a failed submit (same
  // pattern as the booking form — WCAG 3.3.1 / 3.3.3).
  useEffect(() => {
    if (!state.fields && !state.message) return;
    const form = formRef.current;
    if (!form) return;
    for (const field of [
      'displayName',
      'bioEn',
      'languages',
      'identityType',
      'identityNumber',
      'contactEmail',
    ] as HostApplyFieldName[]) {
      if (state.fields?.[field]) {
        const el = form.elements.namedItem(field);
        if (el instanceof HTMLElement) {
          el.focus();
          return;
        }
        // languages renders as a fieldset, not a single element — fall
        // through to the form-level alert.
      }
    }
    form.querySelector<HTMLElement>('[data-form-error]')?.focus();
  }, [state]);

  function fieldProps(field: HostApplyFieldName) {
    const hasError = Boolean(state.fields?.[field]);
    const hasHint = FIELDS_WITH_HINTS.has(field);
    const describedBy =
      [hasHint ? hintId(field) : null, hasError ? errorId(field) : null]
        .filter((id): id is string => id !== null)
        .join(' ') || undefined;
    return {
      'aria-invalid': hasError ? ('true' as const) : undefined,
      'aria-describedby': describedBy,
    };
  }

  const formMessage =
    state.message === 'server'
      ? copy.errors.server
      : state.message === 'auth_required'
        ? copy.errors.authRequired
        : state.message === 'validation'
          ? copy.errors.validation
          : undefined;

  function toggleLanguage(lang: string, checked: boolean) {
    setSelectedLanguages((current) =>
      checked ? Array.from(new Set([...current, lang])) : current.filter((l) => l !== lang),
    );
  }

  const sectionLabel = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-12">
      <input type="hidden" name="locale" value={locale} />

      {/* ----- About you ----- */}
      <fieldset className="flex flex-col gap-6">
        <legend className={sectionLabel}>{copy.sectionAbout}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-displayName" className="text-sm font-medium">
            {copy.displayNameLabel}
          </label>
          <Input
            id="apply-displayName"
            name="displayName"
            autoComplete="name"
            required
            defaultValue={values.displayName ?? initial?.displayName}
            {...fieldProps('displayName')}
          />
          <p id={hintId('displayName')} className="text-sarat-black-600 text-sm">
            {copy.displayNameHint}
          </p>
          <FieldError
            id={errorId('displayName')}
            message={errorMessage(state.fields?.displayName, copy)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-bioEn" className="text-sm font-medium">
            {copy.bioLabel}
          </label>
          <textarea
            id="apply-bioEn"
            name="bioEn"
            rows={5}
            required
            minLength={40}
            maxLength={1200}
            defaultValue={values.bioEn ?? initial?.bioEn}
            className={cn(
              'rounded-input border-sarat-black/20 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
              'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
            )}
            {...fieldProps('bioEn')}
          />
          <p id={hintId('bioEn')} className="text-sarat-black-600 text-sm">
            {copy.bioHint}
          </p>
          <FieldError id={errorId('bioEn')} message={errorMessage(state.fields?.bioEn, copy)} />
        </div>

        <div className="flex flex-col gap-2">
          <fieldset>
            <legend className="text-sm font-medium">{copy.languagesLabel}</legend>
            <div className="mt-3 flex flex-wrap gap-2" {...fieldProps('languages')}>
              {languageOptions.map(({ value, label }) => {
                const checked = selectedLanguages.includes(value);
                return (
                  <label
                    key={value}
                    className={cn(
                      'rounded-button border-sarat-black/20 inline-flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
                      checked
                        ? 'bg-sarat-black border-sarat-black text-white'
                        : 'text-sarat-black hover:border-sarat-black/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      name="languages"
                      value={value}
                      checked={checked}
                      onChange={(e) => toggleLanguage(value, e.target.checked)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p id={hintId('languages')} className="text-sarat-black-600 text-sm">
            {copy.languagesHint}
          </p>
          <FieldError
            id={errorId('languages')}
            message={errorMessage(state.fields?.languages, copy)}
          />
        </div>
      </fieldset>

      {/* ----- Identity ----- */}
      <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
        <legend className={sectionLabel}>{copy.sectionIdentity}</legend>

        <div className="flex flex-col gap-2">
          <span id={`${errorPrefix}-identityType-label`} className="text-sm font-medium">
            {copy.identityTypeLabel}
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${errorPrefix}-identityType-label`}
            className="flex flex-wrap gap-2"
          >
            {(
              [
                { value: 'national_id', label: copy.identityTypeNationalId },
                { value: 'cr', label: copy.identityTypeCr },
              ] as const
            ).map(({ value, label }) => {
              const checked = identityType === value;
              return (
                <label
                  key={value}
                  className={cn(
                    'rounded-button border-sarat-black/20 inline-flex min-h-11 cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
                    checked
                      ? 'bg-sarat-black border-sarat-black text-white'
                      : 'text-sarat-black hover:border-sarat-black/40',
                  )}
                >
                  <input
                    type="radio"
                    name="identityType"
                    value={value}
                    checked={checked}
                    onChange={() => setIdentityType(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-identityNumber" className="text-sm font-medium">
            {copy.identityNumberLabel}
          </label>
          <Input
            id="apply-identityNumber"
            name="identityNumber"
            inputMode="numeric"
            pattern="\d{10}"
            maxLength={10}
            required
            dir="ltr"
            defaultValue={values.identityNumber ?? initial?.identityNumber}
            {...fieldProps('identityNumber')}
          />
          <p id={hintId('identityNumber')} className="text-sarat-black-600 text-sm">
            {copy.identityNumberHint}
          </p>
          <FieldError
            id={errorId('identityNumber')}
            message={errorMessage(state.fields?.identityNumber, copy)}
          />
        </div>
      </fieldset>

      {/* ----- Contact ----- */}
      <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
        <legend className={sectionLabel}>{copy.sectionContact}</legend>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{copy.contactPhoneLabel}</span>
          <p className="text-sarat-black inline-flex h-11 items-center text-base" dir="ltr">
            {contactPhone}
          </p>
          <p className="text-sarat-black-600 text-sm">{copy.contactPhoneHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-contactEmail" className="text-sm font-medium">
            {copy.contactEmailLabel}
          </label>
          <Input
            id="apply-contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            defaultValue={values.contactEmail ?? initial?.contactEmail}
            {...fieldProps('contactEmail')}
          />
          <p id={hintId('contactEmail')} className="text-sarat-black-600 text-sm">
            {copy.contactEmailHint}
          </p>
          <FieldError
            id={errorId('contactEmail')}
            message={errorMessage(state.fields?.contactEmail, copy)}
          />
        </div>
      </fieldset>

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

      <div className="flex justify-start">
        <SubmitButton pending={copy.pending} submit={copy.submit} />
      </div>
    </form>
  );
}
