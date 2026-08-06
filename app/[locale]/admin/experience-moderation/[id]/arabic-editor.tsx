'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  updateExperienceArabicCopy,
  type AdminModerationResult,
} from '@/features/admin/experience-moderation/actions';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'title_ar_invalid'
  | 'description_ar_invalid';

interface Copy {
  heading: string;
  description: string;
  /** Shown when either field still holds a TODO(ar) placeholder. */
  pendingHint: string;
  titleLabel: string;
  descriptionLabel: string;
  inclusionsLabel: string;
  whatToBringLabel: string;
  /** One-item-per-line hint shared by the two list textareas. */
  listsHint: string;
  save: string;
  saving: string;
  errors: Record<ErrorKey, string>;
}

export interface ArabicEditorProps {
  experienceId: string;
  locale: Locale;
  titleAr: string;
  descriptionAr: string;
  inclusionsAr: readonly string[];
  whatToBringAr: readonly string[];
  copy: Copy;
}

const initialState: AdminModerationResult = { success: false };

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
);

function SaveButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function errorMessage(result: AdminModerationResult, copy: Copy): string | undefined {
  if (result.message === 'validation' && result.fieldError) {
    const key = result.fieldError as ErrorKey;
    if (key in copy.errors) return copy.errors[key];
    return copy.errors.validation;
  }
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function ArabicEditor({
  experienceId,
  locale,
  titleAr,
  descriptionAr,
  inclusionsAr,
  whatToBringAr,
  copy,
}: ArabicEditorProps) {
  const [state, action] = useActionState(updateExperienceArabicCopy, initialState);
  const titleId = useId();
  const descriptionId = useId();
  const inclusionsId = useId();
  const whatToBringId = useId();

  const error = errorMessage(state, copy);
  const isPending = titleAr.startsWith('TODO(ar') || descriptionAr.startsWith('TODO(ar');

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h2>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.description}</p>
      </div>

      {isPending && <p className="text-sarat-black-600 text-sm italic">{copy.pendingHint}</p>}

      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm font-medium">
          {copy.titleLabel}
        </label>
        <Input id={titleId} name="titleAr" dir="rtl" maxLength={160} defaultValue={titleAr} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={descriptionId} className="text-sm font-medium">
          {copy.descriptionLabel}
        </label>
        <textarea
          id={descriptionId}
          name="descriptionAr"
          rows={6}
          dir="rtl"
          maxLength={5000}
          defaultValue={descriptionAr}
          className={TEXTAREA_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={inclusionsId} className="text-sm font-medium">
            {copy.inclusionsLabel}
          </label>
          <textarea
            id={inclusionsId}
            name="inclusionsArRaw"
            rows={4}
            dir="rtl"
            defaultValue={inclusionsAr.join('\n')}
            className={TEXTAREA_CLASS}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={whatToBringId} className="text-sm font-medium">
            {copy.whatToBringLabel}
          </label>
          <textarea
            id={whatToBringId}
            name="whatToBringArRaw"
            rows={4}
            dir="rtl"
            defaultValue={whatToBringAr.join('\n')}
            className={TEXTAREA_CLASS}
          />
        </div>
      </div>
      <p className="text-sarat-black-600 text-sm">{copy.listsHint}</p>

      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-start">
        <SaveButton label={copy.save} pendingLabel={copy.saving} />
      </div>
    </form>
  );
}
