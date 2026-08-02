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
  type HostApplyDocumentError,
} from '@/features/host-applications/actions';
import {
  ACCEPTED_DOCUMENT_ATTR,
  documentTypesFor,
  isRequiredDocument,
  validateDocument,
} from '@/features/host-applications/lib/documents';
import type {
  HostDocumentStatus,
  HostDocumentType,
  HostIdentityType,
  HostLanguage,
} from '@/features/host-applications/types';

type ErrorKey =
  | 'validation'
  | 'server'
  | 'authRequired'
  | 'cooldown'
  | 'already_approved'
  | 'upload_failed'
  | 'display_name_short'
  | 'display_name_long'
  | 'bio_short'
  | 'bio_long'
  | 'bio_ar_short'
  | 'bio_ar_long'
  | 'languages_required'
  | 'identity_invalid'
  | 'legal_name_short'
  | 'legal_name_long'
  | 'dob_required'
  | 'dob_invalid'
  | 'dob_underage'
  | 'iban_invalid'
  | 'bank_name_short'
  | 'bank_name_long'
  | 'account_holder_short'
  | 'account_holder_long'
  | 'vat_invalid'
  | 'terms_required'
  | 'email_invalid'
  | 'required';

interface HostApplyCopy {
  sectionAbout: string;
  sectionIdentity: string;
  sectionPayout: string;
  sectionDocuments: string;
  sectionContact: string;
  displayNameLabel: string;
  displayNameHint: string;
  bioLabel: string;
  bioHint: string;
  bioArLabel: string;
  bioArHint: string;
  languagesLabel: string;
  languagesHint: string;
  identityTypeLabel: string;
  identityTypeNationalId: string;
  identityTypeCr: string;
  identityNumberLabel: string;
  identityNumberHint: string;
  legalNameLabel: string;
  legalNameHint: string;
  dateOfBirthLabel: string;
  vatNumberLabel: string;
  vatNumberHint: string;
  ibanLabel: string;
  ibanHint: string;
  bankNameLabel: string;
  bankAccountHolderLabel: string;
  bankAccountHolderHint: string;
  documentsIntro: string;
  documentOptional: string;
  documentUploaded: string;
  documentReplaceHint: string;
  documentStatuses: Record<HostDocumentStatus, string>;
  documentLabels: Record<HostDocumentType, string>;
  documentErrors: Record<HostApplyDocumentError, string>;
  contactPhoneLabel: string;
  contactPhoneHint: string;
  contactEmailLabel: string;
  contactEmailHint: string;
  termsLabel: string;
  submit: string;
  pending: string;
  errors: Record<ErrorKey, string>;
}

/** Prior upload of one type — drives the required/replace UI. */
export interface HostApplyExistingDocument {
  type: HostDocumentType;
  fileName: string;
  status: HostDocumentStatus;
  reviewerNotes: string | null;
}

export interface HostApplyFormInitial {
  displayName: string;
  bioEn: string;
  bioAr: string;
  languages: string[];
  identityType: HostIdentityType;
  identityNumber: string;
  legalName: string;
  dateOfBirth: string;
  iban: string;
  bankName: string;
  bankAccountHolder: string;
  vatNumber: string;
  contactEmail: string;
  city: string;
  region: string;
}

export interface HostApplyFormProps {
  locale: Locale;
  contactPhone: string;
  initial?: HostApplyFormInitial;
  /** False in stub mode (no real storage) — hides the upload section. */
  documentsEnabled: boolean;
  existingDocuments: readonly HostApplyExistingDocument[];
  languageOptions: ReadonlyArray<{ value: HostLanguage; label: string }>;
  copy: HostApplyCopy;
}

const initialState: HostApplyState = { success: false };

const FIELDS_WITH_HINTS: ReadonlySet<HostApplyFieldName> = new Set([
  'displayName',
  'bioEn',
  'bioAr',
  'languages',
  'identityNumber',
  'legalName',
  'iban',
  'bankAccountHolder',
  'vatNumber',
  'contactEmail',
]);

const FOCUS_ORDER: readonly HostApplyFieldName[] = [
  'displayName',
  'bioEn',
  'bioAr',
  'languages',
  'identityType',
  'identityNumber',
  'legalName',
  'dateOfBirth',
  'vatNumber',
  'iban',
  'bankName',
  'bankAccountHolder',
  'contactEmail',
  'termsAccepted',
];

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

/** Latest date of birth an 18-year-old can have, for the input's `max`. */
function maxDateOfBirth(): string {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return cutoff.toISOString().slice(0, 10);
}

export function HostApplyForm({
  locale,
  contactPhone,
  initial,
  documentsEnabled,
  existingDocuments,
  languageOptions,
  copy,
}: HostApplyFormProps) {
  const [state, formAction] = useActionState(submitHostApplication, initialState);
  const values = state.values ?? {};
  // Controlled state for the inputs that need it: identity type (drives
  // input mode, the visible document list, and the DOB/VAT fields),
  // language checkboxes (so re-renders preserve ticks), and client-side
  // pre-upload file errors (fail fast before a multi-MB submit).
  const [identityType, setIdentityType] = useState<HostIdentityType>(
    (values.identityType as HostIdentityType | undefined) ?? initial?.identityType ?? 'national_id',
  );
  const [selectedLanguages, setSelectedLanguages] = useState<readonly string[]>(
    () => values.languages ?? initial?.languages ?? ['ar'],
  );
  const [fileErrors, setFileErrors] = useState<
    Partial<Record<HostDocumentType, HostApplyDocumentError>>
  >({});

  const existingByType = new Map(existingDocuments.map((d) => [d.type, d]));

  const formRef = useRef<HTMLFormElement>(null);
  const errorPrefix = useId();
  const errorId = (field: HostApplyFieldName) => `${errorPrefix}-${field}-error`;
  const hintId = (field: HostApplyFieldName) => `${errorPrefix}-${field}-hint`;
  const formErrorId = `${errorPrefix}-form-error`;

  // Move focus to the first invalid field after a failed submit (same
  // pattern as the booking form — WCAG 3.3.1 / 3.3.3).
  useEffect(() => {
    if (!state.fields && !state.documents && !state.message) return;
    const form = formRef.current;
    if (!form) return;
    for (const field of FOCUS_ORDER) {
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
    for (const [type] of Object.entries(state.documents ?? {})) {
      const el = form.elements.namedItem(`doc_${type}`);
      if (el instanceof HTMLElement) {
        el.focus();
        return;
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
        : state.message === 'cooldown'
          ? copy.errors.cooldown
          : state.message === 'upload_failed'
            ? copy.errors.upload_failed
            : state.message === 'validation'
              ? copy.errors.validation
              : undefined;

  function toggleLanguage(lang: string, checked: boolean) {
    setSelectedLanguages((current) =>
      checked ? Array.from(new Set([...current, lang])) : current.filter((l) => l !== lang),
    );
  }

  function onFileChange(type: HostDocumentType, file: File | null) {
    setFileErrors((current) => {
      const next = { ...current };
      delete next[type];
      if (file && file.size > 0) {
        const check = validateDocument({ size: file.size, type: file.type });
        if (!check.ok && check.reason !== 'missing') {
          next[type] = check.reason === 'size' ? 'doc_size' : 'doc_type';
        }
      }
      return next;
    });
  }

  const sectionLabel = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );
  const isIndividual = identityType === 'national_id';

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
          <label htmlFor="apply-bioAr" className="text-sm font-medium">
            {copy.bioArLabel}
          </label>
          <textarea
            id="apply-bioAr"
            name="bioAr"
            rows={5}
            maxLength={1200}
            defaultValue={values.bioAr ?? initial?.bioAr}
            // Host-authored Arabic copy — force RTL regardless of the UI locale.
            dir="rtl"
            lang="ar"
            className={cn(
              'rounded-input border-sarat-black/20 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
              'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
            )}
            {...fieldProps('bioAr')}
          />
          <p id={hintId('bioAr')} className="text-sarat-black-600 text-sm">
            {copy.bioArHint}
          </p>
          <FieldError id={errorId('bioAr')} message={errorMessage(state.fields?.bioAr, copy)} />
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

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-legalName" className="text-sm font-medium">
            {copy.legalNameLabel}
          </label>
          <Input
            id="apply-legalName"
            name="legalName"
            autoComplete="off"
            required
            defaultValue={values.legalName ?? initial?.legalName}
            {...fieldProps('legalName')}
          />
          <p id={hintId('legalName')} className="text-sarat-black-600 text-sm">
            {copy.legalNameHint}
          </p>
          <FieldError
            id={errorId('legalName')}
            message={errorMessage(state.fields?.legalName, copy)}
          />
        </div>

        {isIndividual ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="apply-dateOfBirth" className="text-sm font-medium">
              {copy.dateOfBirthLabel}
            </label>
            <Input
              id="apply-dateOfBirth"
              name="dateOfBirth"
              type="date"
              required
              dir="ltr"
              max={maxDateOfBirth()}
              defaultValue={values.dateOfBirth ?? initial?.dateOfBirth}
              {...fieldProps('dateOfBirth')}
            />
            <FieldError
              id={errorId('dateOfBirth')}
              message={errorMessage(state.fields?.dateOfBirth, copy)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="apply-vatNumber" className="text-sm font-medium">
              {copy.vatNumberLabel}
            </label>
            <Input
              id="apply-vatNumber"
              name="vatNumber"
              inputMode="numeric"
              maxLength={15}
              dir="ltr"
              defaultValue={values.vatNumber ?? initial?.vatNumber}
              {...fieldProps('vatNumber')}
            />
            <p id={hintId('vatNumber')} className="text-sarat-black-600 text-sm">
              {copy.vatNumberHint}
            </p>
            <FieldError
              id={errorId('vatNumber')}
              message={errorMessage(state.fields?.vatNumber, copy)}
            />
          </div>
        )}
      </fieldset>

      {/* ----- Payout account ----- */}
      <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
        <legend className={sectionLabel}>{copy.sectionPayout}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-iban" className="text-sm font-medium">
            {copy.ibanLabel}
          </label>
          <Input
            id="apply-iban"
            name="iban"
            autoComplete="off"
            required
            dir="ltr"
            placeholder="SA00 0000 0000 0000 0000 0000"
            defaultValue={values.iban ?? initial?.iban}
            {...fieldProps('iban')}
          />
          <p id={hintId('iban')} className="text-sarat-black-600 text-sm">
            {copy.ibanHint}
          </p>
          <FieldError id={errorId('iban')} message={errorMessage(state.fields?.iban, copy)} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-bankName" className="text-sm font-medium">
            {copy.bankNameLabel}
          </label>
          <Input
            id="apply-bankName"
            name="bankName"
            required
            defaultValue={values.bankName ?? initial?.bankName}
            {...fieldProps('bankName')}
          />
          <FieldError
            id={errorId('bankName')}
            message={errorMessage(state.fields?.bankName, copy)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apply-bankAccountHolder" className="text-sm font-medium">
            {copy.bankAccountHolderLabel}
          </label>
          <Input
            id="apply-bankAccountHolder"
            name="bankAccountHolder"
            required
            defaultValue={values.bankAccountHolder ?? initial?.bankAccountHolder}
            {...fieldProps('bankAccountHolder')}
          />
          <p id={hintId('bankAccountHolder')} className="text-sarat-black-600 text-sm">
            {copy.bankAccountHolderHint}
          </p>
          <FieldError
            id={errorId('bankAccountHolder')}
            message={errorMessage(state.fields?.bankAccountHolder, copy)}
          />
        </div>
      </fieldset>

      {/* ----- Documents ----- */}
      {documentsEnabled && (
        <fieldset className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
          <legend className={sectionLabel}>{copy.sectionDocuments}</legend>
          <p className="text-sarat-black-600 text-sm">{copy.documentsIntro}</p>

          {documentTypesFor(identityType).map((type) => {
            const existing = existingByType.get(type);
            const required = isRequiredDocument(identityType, type);
            // A required doc that carries over (uploaded, not rejected)
            // doesn't force a re-upload.
            const needsFile = required && (!existing || existing.status === 'rejected');
            const errorCode = fileErrors[type] ?? state.documents?.[type];
            const fieldId = `apply-doc-${type}`;
            const errId = `${errorPrefix}-doc-${type}-error`;
            return (
              <div key={type} className="flex flex-col gap-2">
                <label htmlFor={fieldId} className="text-sm font-medium">
                  {copy.documentLabels[type]}
                  {!required && (
                    <span className="text-sarat-black-600 font-normal">
                      {' '}
                      · {copy.documentOptional}
                    </span>
                  )}
                </label>
                {existing && (
                  <p className="text-sarat-black-600 text-sm" dir="ltr">
                    {copy.documentUploaded} {existing.fileName} —{' '}
                    {copy.documentStatuses[existing.status]}
                  </p>
                )}
                {existing?.status === 'rejected' && existing.reviewerNotes && (
                  <p className="text-al-qatt-red-800 text-sm whitespace-pre-line">
                    {existing.reviewerNotes}
                  </p>
                )}
                <input
                  id={fieldId}
                  name={`doc_${type}`}
                  type="file"
                  accept={ACCEPTED_DOCUMENT_ATTR}
                  required={needsFile}
                  aria-invalid={errorCode ? 'true' : undefined}
                  aria-describedby={errorCode ? errId : undefined}
                  onChange={(e) => onFileChange(type, e.target.files?.[0] ?? null)}
                  className={cn(
                    'rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white px-4 py-3 text-sm',
                    'file:me-3 file:cursor-pointer file:border-0 file:bg-transparent file:p-0 file:text-sm file:font-medium',
                  )}
                />
                {existing && !needsFile && (
                  <p className="text-sarat-black-600 text-sm">{copy.documentReplaceHint}</p>
                )}
                <FieldError id={errId} message={errorCode && copy.documentErrors[errorCode]} />
              </div>
            );
          })}
        </fieldset>
      )}

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

      {/* ----- Consent ----- */}
      <div className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-12">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="termsAccepted"
            defaultChecked={values.termsAccepted === 'on'}
            className="border-sarat-black/40 accent-sarat-black mt-1 size-5 shrink-0"
            {...fieldProps('termsAccepted')}
          />
          <span className="text-sm leading-relaxed">{copy.termsLabel}</span>
        </label>
        <FieldError
          id={errorId('termsAccepted')}
          message={errorMessage(state.fields?.termsAccepted, copy)}
        />
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

      <div className="flex justify-start">
        <SubmitButton pending={copy.pending} submit={copy.submit} />
      </div>
    </form>
  );
}
