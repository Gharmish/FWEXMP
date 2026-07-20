'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPromoCode, type PromoAdminActionState } from '@/features/promo-codes/admin-actions';

export interface CreatePromoFormCopy {
  codeLabel: string;
  codeHint: string;
  labelLabel: string;
  labelHint: string;
  typeLabel: string;
  typePercent: string;
  typeFixed: string;
  valueLabel: string;
  minTotalLabel: string;
  minTotalHint: string;
  maxRedemptionsLabel: string;
  maxRedemptionsHint: string;
  maxPerGuestLabel: string;
  maxPerGuestHint: string;
  startsAtLabel: string;
  endsAtLabel: string;
  optional: string;
  submit: string;
  submitPending: string;
  success: string;
  fieldInvalid: string;
  codeTaken: string;
  formServer: string;
  formForbidden: string;
  formValidation: string;
}

export interface CreatePromoFormProps {
  locale: Locale;
  copy: CreatePromoFormCopy;
}

const initialState: PromoAdminActionState = { success: false };

function SubmitButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

const labelClass = 'text-sarat-black-600 text-xs font-medium';
const hintClass = 'text-sarat-black-600 text-xs';
const errorClass = 'text-al-qatt-red-800 text-xs';

export function CreatePromoForm({ locale, copy }: CreatePromoFormProps) {
  const [state, formAction] = useActionState(createPromoCode, initialState);
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  const fields = state.success ? {} : (state.fields ?? {});
  const formError = state.success
    ? undefined
    : state.message === 'code_taken'
      ? copy.codeTaken
      : state.message === 'forbidden'
        ? copy.formForbidden
        : state.message === 'server'
          ? copy.formServer
          : state.message === 'validation'
            ? copy.formValidation
            : undefined;

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-code`} className={labelClass}>
            {copy.codeLabel}
          </label>
          <Input
            id={`${uid}-code`}
            name="code"
            dir="ltr"
            autoCapitalize="characters"
            className="uppercase"
            aria-invalid={fields.code ? true : undefined}
          />
          {fields.code ? (
            <p className={errorClass}>{copy.fieldInvalid}</p>
          ) : (
            <p className={hintClass}>{copy.codeHint}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-label`} className={labelClass}>
            {copy.labelLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input id={`${uid}-label`} name="label" aria-invalid={fields.label ? true : undefined} />
          <p className={hintClass}>{copy.labelHint}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-type`} className={labelClass}>
            {copy.typeLabel}
          </label>
          <select
            id={`${uid}-type`}
            name="discountType"
            defaultValue="percent"
            className={cn(
              'rounded-input border-sarat-black/20 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-4 text-base',
            )}
          >
            <option value="percent">{copy.typePercent}</option>
            <option value="fixed">{copy.typeFixed}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-value`} className={labelClass}>
            {copy.valueLabel}
          </label>
          <Input
            id={`${uid}-value`}
            name="discountValue"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            aria-invalid={fields.discountValue ? true : undefined}
          />
          {fields.discountValue && <p className={errorClass}>{copy.fieldInvalid}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-min`} className={labelClass}>
            {copy.minTotalLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input
            id={`${uid}-min`}
            name="minTotalSar"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            aria-invalid={fields.minTotalSar ? true : undefined}
          />
          {fields.minTotalSar ? (
            <p className={errorClass}>{copy.fieldInvalid}</p>
          ) : (
            <p className={hintClass}>{copy.minTotalHint}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-max`} className={labelClass}>
            {copy.maxRedemptionsLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input
            id={`${uid}-max`}
            name="maxRedemptions"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            aria-invalid={fields.maxRedemptions ? true : undefined}
          />
          {fields.maxRedemptions ? (
            <p className={errorClass}>{copy.fieldInvalid}</p>
          ) : (
            <p className={hintClass}>{copy.maxRedemptionsHint}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-max-guest`} className={labelClass}>
            {copy.maxPerGuestLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input
            id={`${uid}-max-guest`}
            name="maxRedemptionsPerGuest"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="1"
            dir="ltr"
            aria-invalid={fields.maxRedemptionsPerGuest ? true : undefined}
          />
          {fields.maxRedemptionsPerGuest ? (
            <p className={errorClass}>{copy.fieldInvalid}</p>
          ) : (
            <p className={hintClass}>{copy.maxPerGuestHint}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-starts`} className={labelClass}>
            {copy.startsAtLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input
            id={`${uid}-starts`}
            name="startsAt"
            type="datetime-local"
            dir="ltr"
            aria-invalid={fields.startsAt ? true : undefined}
          />
          {fields.startsAt && <p className={errorClass}>{copy.fieldInvalid}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-ends`} className={labelClass}>
            {copy.endsAtLabel}{' '}
            <span className="text-sarat-black-600 font-normal">({copy.optional})</span>
          </label>
          <Input
            id={`${uid}-ends`}
            name="endsAt"
            type="datetime-local"
            dir="ltr"
            aria-invalid={fields.endsAt ? true : undefined}
          />
          {fields.endsAt && <p className={errorClass}>{copy.fieldInvalid}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={copy.submit} pending={copy.submitPending} />
        {state.success && (
          <p role="status" className="text-juniper-green-800 flex items-center gap-1 text-xs">
            <Check className="size-3.5" aria-hidden />
            {copy.success}
          </p>
        )}
        {formError && (
          <p role="alert" className={errorClass}>
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
