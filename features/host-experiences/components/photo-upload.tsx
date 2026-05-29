'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { ImageUp } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  uploadExperienceHero,
  type UploadHeroState,
} from '@/features/host-experiences/photo-actions';
import { ACCEPTED_PHOTO_ATTR, validatePhoto } from '@/features/host-experiences/lib/photo';

type ErrorKey = NonNullable<UploadHeroState['message']>;

export interface PhotoUploadCopy {
  heading: string;
  description: string;
  currentAlt: string;
  noPhoto: string;
  choose: string;
  replace: string;
  hint: string;
  submit: string;
  submitting: string;
  errors: Record<ErrorKey, string>;
}

export interface PhotoUploadProps {
  experienceId: string;
  locale: Locale;
  /** Current hero image URL (Supabase public URL), or null if none yet. */
  currentUrl: string | null;
  copy: PhotoUploadCopy;
}

const initialState: UploadHeroState = { success: false };

function Submit({ copy, disabled }: { copy: PhotoUploadCopy; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending || disabled}>
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

export function PhotoUpload({ experienceId, locale, currentUrl, copy }: PhotoUploadProps) {
  const [state, action] = useActionState(uploadExperienceHero, initialState);
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientError, setClientError] = useState<ErrorKey | null>(null);
  const inputId = useId();

  const serverError = state.message
    ? (copy.errors[state.message] ?? copy.errors.server)
    : undefined;
  const error = clientError ? copy.errors[clientError] : serverError;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h2>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.description}</p>
      </div>

      <div className="bg-sarat-black/5 rounded-image relative aspect-[16/10] w-full max-w-md overflow-hidden">
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt={copy.currentAlt}
            fill
            sizes="(max-width: 768px) 100vw, 28rem"
            className="object-cover"
          />
        ) : (
          <div className="text-sarat-black-600 flex h-full flex-col items-center justify-center gap-2">
            <ImageUp className="size-6" aria-hidden />
            <span className="text-sm">{copy.noPhoto}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            'border-sarat-black/20 text-sarat-black rounded-button inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px',
          )}
        >
          <ImageUp className="size-4" aria-hidden />
          {currentUrl ? copy.replace : copy.choose}
        </label>
        <input
          id={inputId}
          type="file"
          name="photo"
          accept={ACCEPTED_PHOTO_ATTR}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setFileName(null);
              setClientError(null);
              return;
            }
            const result = validatePhoto({ size: file.size, type: file.type });
            if (!result.ok) {
              setClientError(result.reason === 'type' ? 'invalid_type' : 'too_large');
              setFileName(null);
            } else {
              setClientError(null);
              setFileName(file.name);
            }
          }}
        />
        {fileName && <span className="text-sarat-black-600 truncate text-sm">{fileName}</span>}
        <p className="text-sarat-black/40 text-xs">{copy.hint}</p>
      </div>

      <Submit copy={copy} disabled={clientError !== null} />

      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
