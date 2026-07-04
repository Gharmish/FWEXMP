'use client';

import { useActionState, useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateHostPhoto, removeHostPhoto } from '@/features/host-profile/actions';
import { ACCEPTED_PHOTO_ATTR } from '@/features/host-experiences/lib/photo';
import type { HostPhotoActionState, HostPhotoErrorKey } from '@/features/host-profile/types';

export interface HostPhotoUploadCopy {
  change: string;
  uploading: string;
  remove: string;
  removing: string;
  hint: string;
  errors: Record<HostPhotoErrorKey, string>;
}

export interface HostPhotoUploadProps {
  /** Current stored photo URL — drives whether the Remove control shows. */
  photoUrl: string | null;
  copy: HostPhotoUploadCopy;
}

const initialState: HostPhotoActionState = { status: 'idle' };

/**
 * Photo controls only — the displayed avatar lives in the identity card
 * and refreshes via revalidatePath after each action. Upload auto-submits
 * on file pick; remove is a plain submit. Sibling of the guest
 * AvatarUpload, pointed at the host actions.
 */
export function HostPhotoUpload({ photoUrl, copy }: HostPhotoUploadProps) {
  const [uploadState, uploadAction, uploading] = useActionState(updateHostPhoto, initialState);
  const [removeState, removeAction, removing] = useActionState(removeHostPhoto, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPhoto =
    uploadState.status === 'success'
      ? Boolean(uploadState.photoUrl)
      : removeState.status === 'success'
        ? Boolean(removeState.photoUrl)
        : Boolean(photoUrl);

  const errorState =
    uploadState.status === 'error'
      ? uploadState
      : removeState.status === 'error'
        ? removeState
        : undefined;

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <form ref={formRef} action={uploadAction}>
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept={ACCEPTED_PHOTO_ATTR}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files?.[0]) formRef.current?.requestSubmit();
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading || removing}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden />
            {uploading ? copy.uploading : copy.change}
          </Button>
        </form>

        {hasPhoto && (
          <form action={removeAction}>
            <Button type="submit" variant="secondary" size="sm" disabled={uploading || removing}>
              <Trash2 aria-hidden />
              {removing ? copy.removing : copy.remove}
            </Button>
          </form>
        )}
      </div>

      {errorState ? (
        <p className="text-al-qatt-red text-sm" role="alert">
          {copy.errors[errorState.message]}
        </p>
      ) : (
        <p className="text-sarat-black-600 text-xs">{copy.hint}</p>
      )}
    </div>
  );
}
