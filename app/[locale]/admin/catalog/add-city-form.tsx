'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addCity, type CatalogActionState } from '@/features/admin/catalog/actions';

export interface AddCityFormCopy {
  nameEnLabel: string;
  nameArLabel: string;
  regionLabel: string;
  submit: string;
  submitPending: string;
  success: string;
  fieldInvalid: string;
  duplicateCity: string;
  formServer: string;
  formForbidden: string;
  formValidation: string;
}

export interface AddCityFormProps {
  locale: Locale;
  copy: AddCityFormCopy;
}

const initialState: CatalogActionState = { success: false };

function SubmitButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AddCityForm({ locale, copy }: AddCityFormProps) {
  const [state, formAction] = useActionState(addCity, initialState);
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the inputs after a successful add so the next city starts fresh.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  const fields = state.success ? {} : (state.fields ?? {});
  const formError = state.success
    ? undefined
    : state.message === 'duplicate_city'
      ? copy.duplicateCity
      : state.message === 'forbidden'
        ? copy.formForbidden
        : state.message === 'server'
          ? copy.formServer
          : state.message === 'validation'
            ? copy.formValidation
            : undefined;

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={`${uid}-nameEn`} className="text-sarat-black-600 text-xs font-medium">
          {copy.nameEnLabel}
        </label>
        <Input
          id={`${uid}-nameEn`}
          name="nameEn"
          dir="ltr"
          aria-invalid={fields.nameEn ? true : undefined}
        />
        {fields.nameEn && <p className="text-al-qatt-red-800 text-xs">{copy.fieldInvalid}</p>}
      </div>

      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={`${uid}-nameAr`} className="text-sarat-black-600 text-xs font-medium">
          {copy.nameArLabel}
        </label>
        <Input
          id={`${uid}-nameAr`}
          name="nameAr"
          dir="rtl"
          aria-invalid={fields.nameAr ? true : undefined}
        />
        {fields.nameAr && <p className="text-al-qatt-red-800 text-xs">{copy.fieldInvalid}</p>}
      </div>

      <div className="flex min-w-32 flex-1 flex-col gap-1">
        <label htmlFor={`${uid}-region`} className="text-sarat-black-600 text-xs font-medium">
          {copy.regionLabel}
        </label>
        <Input
          id={`${uid}-region`}
          name="region"
          defaultValue="Asir"
          aria-invalid={fields.region ? true : undefined}
        />
        {fields.region && <p className="text-al-qatt-red-800 text-xs">{copy.fieldInvalid}</p>}
      </div>

      <SubmitButton label={copy.submit} pending={copy.submitPending} />

      {state.success && (
        <p role="status" className="text-juniper-green-800 flex items-center gap-1 text-xs">
          <Check className="size-3.5" aria-hidden />
          {copy.success}
        </p>
      )}
      {formError && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {formError}
        </p>
      )}
    </form>
  );
}
