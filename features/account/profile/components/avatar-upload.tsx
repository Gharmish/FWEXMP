'use client';

import { useActionState, useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { updateAvatar, removeAvatar } from '@/features/account/profile/actions';
import { AVATAR_MIME_TYPES } from '@/features/account/profile/schemas';
import type { AvatarActionState, AvatarErrorKey } from '@/features/account/profile/types';

export interface AvatarUploadCopy {
  alt: string;
  change: string;
  uploading: string;
  remove: string;
  removing: string;
  hint: string;
  errors: Record<AvatarErrorKey, string>;
}

export interface AvatarUploadProps {
  name: string;
  avatarUrl: string | null;
  copy: AvatarUploadCopy;
}

const initialState: AvatarActionState = { status: 'idle' };

export function AvatarUpload({ name, avatarUrl, copy }: AvatarUploadProps) {
  const [uploadState, uploadAction, uploading] = useActionState(updateAvatar, initialState);
  const [removeState, removeAction, removing] = useActionState(removeAvatar, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Source of truth for the shown image: the latest action result, falling
  // back to the server-rendered URL. No blob preview — next/image (Avatar)
  // rejects blob: URLs, and the action revalidates fast enough.
  const serverUrl =
    uploadState.status === 'success'
      ? uploadState.avatarUrl
      : removeState.status === 'success'
        ? removeState.avatarUrl
        : avatarUrl;
  const shownUrl = serverUrl ?? undefined;

  const errorState =
    uploadState.status === 'error'
      ? uploadState
      : removeState.status === 'error'
        ? removeState
        : undefined;

  return (
    <div className="flex items-center gap-5">
      <Avatar name={name} src={shownUrl} size="lg" className="size-20" />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
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

          {serverUrl && (
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
    </div>
  );
}
