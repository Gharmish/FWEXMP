'use client';

import { useActionState, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateHostPhoto, removeHostPhoto } from '@/features/host-profile/actions';
import { ACCEPTED_PHOTO_ATTR, validateSelectedPhoto } from '@/features/listings/lib/photo';
import { fitToPhoto, PROFILE_MAX_EDGE } from '@/features/host-experiences/lib/image-process';
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
 *
 * The picked photo is shrunk and re-encoded in the browser before it is
 * submitted: a phone original is several megabytes, over the 4MB upload
 * limit, and may be in a format the server does not store.
 */
export function HostPhotoUpload({ photoUrl, copy }: HostPhotoUploadProps) {
  const [uploadState, uploadAction, uploading] = useActionState(updateHostPhoto, initialState);
  const [removeState, removeAction, removing] = useActionState(removeHostPhoto, initialState);
  const [preparing, setPreparing] = useState(false);
  const [clientError, setClientError] = useState<HostPhotoErrorKey | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /** The picker the host sees; its file never posts. */
  const pickerRef = useRef<HTMLInputElement>(null);
  /** Holds the prepared photo staged via DataTransfer; this is what posts. */
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = preparing || uploading || removing;

  async function handlePick(file: File | undefined) {
    if (!file) return;
    const picked = validateSelectedPhoto({ size: file.size, type: file.type });
    if (!picked.ok) {
      setClientError(picked.reason === 'type' ? 'invalid_type' : 'no_file');
      return;
    }
    setClientError(null);
    setPreparing(true);
    try {
      const prepared = await fitToPhoto(file, PROFILE_MAX_EDGE, 'profile');
      const input = inputRef.current;
      if (!input) return;
      const transfer = new DataTransfer();
      transfer.items.add(prepared);
      input.files = transfer.files;
      formRef.current?.requestSubmit();
    } catch {
      // Not an image this browser can open.
      setClientError('invalid_type');
    } finally {
      setPreparing(false);
    }
  }

  const hasPhoto =
    uploadState.status === 'success'
      ? Boolean(uploadState.photoUrl)
      : removeState.status === 'success'
        ? Boolean(removeState.photoUrl)
        : Boolean(photoUrl);

  const errorKey =
    clientError ??
    (uploadState.status === 'error'
      ? uploadState.message
      : removeState.status === 'error'
        ? removeState.message
        : undefined);

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <form ref={formRef} action={uploadAction}>
          <input
            ref={inputRef}
            type="file"
            name="photo"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <input
            ref={pickerRef}
            type="file"
            accept={ACCEPTED_PHOTO_ATTR}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void handlePick(event.target.files?.[0]);
              // Allow re-picking the same file (onChange wouldn't fire again).
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => pickerRef.current?.click()}
          >
            <Camera aria-hidden />
            {preparing || uploading ? copy.uploading : copy.change}
          </Button>
        </form>

        {hasPhoto && (
          <form action={removeAction}>
            <Button type="submit" variant="secondary" size="sm" disabled={busy}>
              <Trash2 aria-hidden />
              {removing ? copy.removing : copy.remove}
            </Button>
          </form>
        )}
      </div>

      {errorKey ? (
        <p className="text-al-qatt-red text-sm" role="alert">
          {copy.errors[errorKey]}
        </p>
      ) : (
        <p className="text-sarat-black-600 text-xs">{copy.hint}</p>
      )}
    </div>
  );
}
