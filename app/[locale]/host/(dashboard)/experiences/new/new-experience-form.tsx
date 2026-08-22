'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  createDraftExperience,
  type HostExperienceState,
} from '@/features/host-experiences/actions';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';

/**
 * Step one of a new listing: a name (in either language) and a
 * category. The draft persists on submit and the host continues on the
 * edit page, where every other section saves on its own — the old
 * 22-field create form lost everything typed to a closed tab
 * (2026-08-22 audit P1-1).
 */
export interface NewExperienceFormCopy {
  titleLabel: string;
  titleHint: string;
  titleArLabel: string;
  titleArHint: string;
  categoryLabel: string;
  categories: Record<(typeof EXPERIENCE_CATEGORIES)[number], string>;
  submit: string;
  submitPending: string;
  errors: {
    validation: string;
    server: string;
    forbidden: string;
    noDb: string;
    titleEither: string;
    titleLong: string;
    titleShort: string;
    titleArInvalid: string;
  };
}

export interface NewExperienceFormProps {
  locale: Locale;
  copy: NewExperienceFormCopy;
}

const initialState: HostExperienceState = { success: false };

const SELECT_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base',
);

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function fieldMessage(code: string | undefined, copy: NewExperienceFormCopy): string | undefined {
  switch (code) {
    case undefined:
      return undefined;
    case 'title_either':
      return copy.errors.titleEither;
    case 'title_short':
      return copy.errors.titleShort;
    case 'title_long':
      return copy.errors.titleLong;
    case 'title_ar_invalid':
      return copy.errors.titleArInvalid;
    default:
      return copy.errors.validation;
  }
}

export function NewExperienceForm({ locale, copy }: NewExperienceFormProps) {
  const [state, formAction] = useActionState(createDraftExperience, initialState);
  const v = state.values;
  const fields = state.fields ?? {};
  const idPrefix = useId();
  const eid = (k: string) => `${idPrefix}-${k}-error`;

  const formError = (() => {
    switch (state.message) {
      case undefined:
        return undefined;
      case 'validation':
        return copy.errors.validation;
      case 'forbidden':
        return copy.errors.forbidden;
      case 'no_db':
        return copy.errors.noDb;
      default:
        return copy.errors.server;
    }
  })();

  const titleEnError = fieldMessage(fields.titleEn, copy);
  const titleArError = fieldMessage(fields.titleAr, copy);
  // Arabic-locale hosts see their language first.
  const arFirst = locale === 'ar';

  const titleEnField = (
    <div className="flex flex-col gap-2">
      <label htmlFor="new-titleEn" className="text-sm font-medium">
        {copy.titleLabel}
      </label>
      <Input
        id="new-titleEn"
        name="titleEn"
        dir="ltr"
        maxLength={120}
        autoFocus={!arFirst}
        defaultValue={v?.titleEn}
        aria-invalid={titleEnError ? 'true' : undefined}
        aria-describedby={titleEnError ? eid('titleEn') : undefined}
      />
      <p className="text-sarat-black-600 text-sm">{copy.titleHint}</p>
      {titleEnError && (
        <p id={eid('titleEn')} role="alert" className="text-al-qatt-red-800 text-sm">
          {titleEnError}
        </p>
      )}
    </div>
  );

  const titleArField = (
    <div className="flex flex-col gap-2">
      <label htmlFor="new-titleAr" className="text-sm font-medium">
        {copy.titleArLabel}
      </label>
      <Input
        id="new-titleAr"
        name="titleAr"
        dir="rtl"
        maxLength={160}
        autoFocus={arFirst}
        defaultValue={v?.titleAr}
        aria-invalid={titleArError ? 'true' : undefined}
        aria-describedby={titleArError ? eid('titleAr') : undefined}
      />
      <p className="text-sarat-black-600 text-sm">{copy.titleArHint}</p>
      {titleArError && (
        <p id={eid('titleAr')} role="alert" className="text-al-qatt-red-800 text-sm">
          {titleArError}
        </p>
      )}
    </div>
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-8">
      <input type="hidden" name="locale" value={locale} />

      {arFirst ? titleArField : titleEnField}
      {arFirst ? titleEnField : titleArField}

      <div className="flex flex-col gap-2">
        <label htmlFor="new-category" className="text-sm font-medium">
          {copy.categoryLabel}
        </label>
        <select
          id="new-category"
          name="category"
          defaultValue={v?.category ?? 'heritage'}
          className={SELECT_CLASS}
        >
          {EXPERIENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {copy.categories[c]}
            </option>
          ))}
        </select>
      </div>

      {formError && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
        </p>
      )}

      <div className="flex justify-start">
        <SubmitButton label={copy.submit} pendingLabel={copy.submitPending} />
      </div>
    </form>
  );
}
