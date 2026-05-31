'use client';

import { useActionState, useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateAvatar, removeAvatar } from '@/features/account/profile/actions';
import { AVATAR_MIME_TYPES } from '@/features/account/profile/schemas';
import type { AvatarActionState, AvatarErrorKey } from '@/features/account/profile/types';

export interface AvatarUploadCopy {
  change: string;
  uploading: string;
  remove: string;
  removing: string;
  hint: string;
  errors: Record<AvatarErrorKey, string>;
}

export interface AvatarUploadProps {
  /** Current stored photo URL — drives whether the Remove control shows. */
  avatarUrl: string | null;
  copy: AvatarUploadCopy;
}

const initialState: AvatarActionState = { status: 'idle' };

/**
 * Photo controls only — the displayed avatar lives in the identity card and
 * refreshes via revalidatePath after each action. Upload auto-submits on file
 * pick; remove is a plain submit.
 */
export function AvatarUpload({ avatarUrl, copy }: AvatarUploadProps) {
  const [uploadState, uploadAction, uploading] = useActionState(updateAvatar, initialState);
  const [removeState, removeAction, removing] = useActionState(removeAvatar, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPhoto =
    uploadState.status === 'success'
      ? Boolean(uploadState.avatarUrl)
      : removeState.status === 'success'
        ? Boolean(removeState.avatarUrl)
        : Boolean(avatarUrl);

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
            name="avatar"
            accept={AVATAR_MIME_TYPES.join(',')}
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
