'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateCity, type CatalogActionState } from '@/features/admin/catalog/actions';

export interface CityRowFormCopy {
  cityNameArLabel: string;
  regionLabel: string;
  enabledLabel: string;
  save: string;
  saving: string;
  success: string;
  fieldInvalid: string;
  formServer: string;
  formForbidden: string;
  notFound: string;
}

export interface CityRowFormProps {
  cityId: string;
  nameAr: string;
  region: string;
  enabled: boolean;
  locale: Locale;
  copy: CityRowFormCopy;
}

const initialState: CatalogActionState = { success: false };

function SaveButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Inline editor for one registered city: Arabic name, region, and the
 * "open for new experiences" flag. The English name is deliberately not
 * editable — it is the join key experiences are stored under.
 */
export function CityRowForm({ cityId, nameAr, region, enabled, locale, copy }: CityRowFormProps) {
  const [state, formAction] = useActionState(updateCity, initialState);
  const uid = useId();

  const fields = state.success ? {} : (state.fields ?? {});
  const formError = state.success
    ? undefined
    : state.message === 'forbidden'
      ? copy.formForbidden
      : state.message === 'not_found'
        ? copy.notFound
        : state.message === 'server'
          ? copy.formServer
          : undefined;

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-wrap items-end gap-3"
      aria-label={copy.cityNameArLabel}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="cityId" value={cityId} />

      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={`${uid}-nameAr`} className="text-sarat-black-600 text-xs font-medium">
          {copy.cityNameArLabel}
        </label>
        <Input
          id={`${uid}-nameAr`}
          name="nameAr"
          defaultValue={nameAr}
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
          defaultValue={region}
          aria-invalid={fields.region ? true : undefined}
        />
        {fields.region && <p className="text-al-qatt-red-800 text-xs">{copy.fieldInvalid}</p>}
      </div>

      <label className="flex h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="accent-saffron-gold size-4"
        />
        {copy.enabledLabel}
      </label>

      <div className="flex flex-col items-start gap-1">
        <SaveButton label={copy.save} pending={copy.saving} />
      </div>

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
