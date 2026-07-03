'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { ImageUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import type { GalleryState } from '@/features/admin/experiences/gallery-actions';
import {
  ACCEPTED_PHOTO_ATTR,
  validatePhoto,
  validateSelectedPhoto,
} from '@/features/host-experiences/lib/photo';
import { fileToWebp } from '@/features/host-experiences/lib/image-process';

/** A gallery mutation as `useActionState` consumes it. */
export type GalleryAction = (previous: GalleryState, formData: FormData) => Promise<GalleryState>;

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
  /** Shown for `locked_live` (host surface only — admins are never locked). */
  lockedLive?: string;
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
  removeAction,
}: {
  experienceId: string;
  url: string;
  copy: GalleryManagerCopy;
  removeAction: GalleryAction;
}) {
  const [, action] = useActionState(removeAction, initialState);
  return (
    <form action={action} className="absolute end-2 top-2">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="url" value={url} />
      <ConfirmSubmit
        title={copy.remove}
        description={copy.removeConfirm}
        confirmLabel={copy.remove}
        pendingLabel={copy.removing}
        destructive
        trigger={(open) => (
          <button
            type="button"
            aria-label={copy.remove}
            onClick={open}
            className="bg-sarat-black/70 inline-flex size-7 items-center justify-center rounded-full text-white backdrop-blur transition-opacity duration-200 hover:opacity-80"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      />
    </form>
  );
}

export function GalleryManager({
  experienceId,
  images,
  copy,
  uploadAction,
  removeAction,
}: {
  experienceId: string;
  images: string[];
  copy: GalleryManagerCopy;
  /** Surface-scoped server actions — admin passes the admin pair, host the host pair. */
  uploadAction: GalleryAction;
  removeAction: GalleryAction;
}) {
  const [state, action] = useActionState(uploadAction, initialState);
  const [clientError, setClientError] = useState<'invalidType' | 'tooLarge' | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // A raw phone photo is several MB and server actions cap the request
  // body — so the picked file is re-encoded to a bounded WebP in the
  // browser (same pipeline as the hero) and swapped back into the input
  // before submit. `ready` gates the button until that finishes.
  const [ready, setReady] = useState(false);
  const inputId = useId();

  const serverError =
    !state.success && state.message
      ? state.message === 'invalid_type'
        ? copy.invalidType
        : state.message === 'too_large'
          ? copy.tooLarge
          : state.message === 'locked_live'
            ? (copy.lockedLive ?? copy.error)
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
              <RemoveButton
                experienceId={experienceId}
                url={url}
                copy={copy}
                removeAction={removeAction}
              />
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
          onChange={async (e) => {
            const input = e.target;
            const file = input.files?.[0];
            setReady(false);
            if (!file) {
              setFileName(null);
              setClientError(null);
              return;
            }
            // Generous input ceiling (30MB) — the re-encode below is what
            // brings the upload under the action body cap.
            const picked = validateSelectedPhoto({ size: file.size, type: file.type });
            if (!picked.ok) {
              setClientError(picked.reason === 'type' ? 'invalidType' : 'tooLarge');
              setFileName(null);
              return;
            }
            setClientError(null);
            setFileName(file.name);
            let staged = file;
            try {
              staged = await fileToWebp(file);
            } catch {
              // Canvas re-encode failed (rare) — fall back to the original
              // if it fits the server's 5MB cap; otherwise surface tooLarge.
              const fallback = validatePhoto({ size: file.size, type: file.type });
              if (!fallback.ok) {
                setClientError('tooLarge');
                setFileName(null);
                return;
              }
            }
            const dt = new DataTransfer();
            dt.items.add(staged);
            input.files = dt.files;
            setReady(true);
          }}
        />
        {fileName && <span className="text-sarat-black-600 truncate text-sm">{fileName}</span>}
        <p className="text-sarat-black/40 text-xs">{copy.hint}</p>
        <UploadSubmit
          label={copy.add}
          pendingLabel={copy.adding}
          disabled={clientError !== null || !ready}
        />
        {error && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
