'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { ImageUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  uploadGalleryImage,
  removeGalleryImage,
  type GalleryState,
} from '@/features/admin/experiences/gallery-actions';
import { ACCEPTED_PHOTO_ATTR, validatePhoto } from '@/features/host-experiences/lib/photo';

export interface GalleryManagerCopy {
  heading: string;
  description: string;
  imageAlt: string;
  choose: string;
  hint: string;
  add: string;
  adding: string;
  remove: string;
  removing: string;
  removeConfirm: string;
  empty: string;
  invalidType: string;
  tooLarge: string;
  error: string;
}

const initialState: GalleryState = { success: false };

function UploadSubmit({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function RemoveButton({
  experienceId,
  url,
  copy,
}: {
  experienceId: string;
  url: string;
  copy: GalleryManagerCopy;
}) {
  const [, action] = useActionState(removeGalleryImage, initialState);
  return (
    <form action={action} className="absolute end-2 top-2">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="url" value={url} />
      <button
        type="submit"
        aria-label={copy.remove}
        onClick={(e) => {
          if (!window.confirm(copy.removeConfirm)) e.preventDefault();
        }}
        className="bg-sarat-black/70 text-fog-white inline-flex size-7 items-center justify-center rounded-full backdrop-blur transition-opacity duration-200 hover:opacity-80"
      >
        <X className="size-4" aria-hidden />
      </button>
    </form>
  );
}

export function GalleryManager({
  experienceId,
  images,
  copy,
}: {
  experienceId: string;
  images: string[];
  copy: GalleryManagerCopy;
}) {
  const [state, action] = useActionState(uploadGalleryImage, initialState);
  const [clientError, setClientError] = useState<'invalidType' | 'tooLarge' | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputId = useId();

  const serverError =
    !state.success && state.message
      ? state.message === 'invalid_type'
        ? copy.invalidType
        : state.message === 'too_large'
          ? copy.tooLarge
          : copy.error
      : undefined;
  const error = clientError
    ? clientError === 'invalidType'
      ? copy.invalidType
      : copy.tooLarge
    : serverError;

  return (
    <section className="border-sarat-black/8 rounded-card flex flex-col gap-5 [border-width:0.5px] p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h2>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.description}</p>
      </div>

      {images.length === 0 ? (
        <p className="text-sarat-black-600 text-sm">{copy.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((url) => (
            <li
              key={url}
              className="bg-sarat-black/5 rounded-image relative aspect-square overflow-hidden"
            >
              <Image src={url} alt={copy.imageAlt} fill sizes="200px" className="object-cover" />
              <RemoveButton experienceId={experienceId} url={url} copy={copy} />
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="experienceId" value={experienceId} />
        <label
          htmlFor={inputId}
          className={cn(
            'border-sarat-black/20 text-sarat-black rounded-button inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px',
          )}
        >
          <ImageUp className="size-4" aria-hidden />
          {copy.choose}
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
              setClientError(result.reason === 'type' ? 'invalidType' : 'tooLarge');
              setFileName(null);
            } else {
              setClientError(null);
              setFileName(file.name);
            }
          }}
        />
        {fileName && <span className="text-sarat-black-600 truncate text-sm">{fileName}</span>}
        <p className="text-sarat-black/40 text-xs">{copy.hint}</p>
        <UploadSubmit label={copy.add} pendingLabel={copy.adding} disabled={clientError !== null} />
        {error && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
