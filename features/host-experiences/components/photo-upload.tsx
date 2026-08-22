'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { ImageUp } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { UploadHeroState } from '@/features/host-experiences/photo-actions';
import { ACCEPTED_PHOTO_ATTR, validateSelectedPhoto } from '@/features/host-experiences/lib/photo';
import { readFileAsDataUrl } from '@/features/host-experiences/lib/image-process';
import {
  HeroCropper,
  type HeroCropperCopy,
} from '@/features/host-experiences/components/hero-cropper';

/** Server action signature shared by the host and admin upload paths. */
export type UploadHeroAction = (
  state: UploadHeroState,
  formData: FormData,
) => Promise<UploadHeroState>;

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
  crop: HeroCropperCopy;
}

export interface PhotoUploadProps {
  experienceId: string;
  locale: Locale;
  /** Current hero image URL (Supabase public URL), or null if none yet. */
  currentUrl: string | null;
  copy: PhotoUploadCopy;
  /** The upload server action — host-scoped or admin-scoped. */
  action: UploadHeroAction;
}

const initialState: UploadHeroState = { success: false };

function Submit({ copy }: { copy: PhotoUploadCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

export function PhotoUpload({
  experienceId,
  locale,
  currentUrl,
  copy,
  action: uploadAction,
}: PhotoUploadProps) {
  const [state, action] = useActionState(uploadAction, initialState);
  const [clientError, setClientError] = useState<ErrorKey | null>(null);
  /** Data URL of the freshly picked file, while the crop sheet is open. */
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  /** Object URL of the cropped result shown in the preview box. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** Whether a processed file is staged in the hidden input, ready to submit. */
  const [ready, setReady] = useState(false);
  const inputId = useId();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The cropped preview is an object URL we own — revoke it when it changes
  // or the component unmounts so we don't leak blobs.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const serverError = state.message
    ? (copy.errors[state.message] ?? copy.errors.server)
    : undefined;
  const error = clientError ? copy.errors[clientError] : serverError;
  const shownUrl = previewUrl ?? currentUrl;

  async function handlePick(file: File | undefined) {
    if (!file) return;
    const result = validateSelectedPhoto({ size: file.size, type: file.type });
    if (!result.ok) {
      setClientError(result.reason === 'type' ? 'invalid_type' : 'too_large');
      return;
    }
    setClientError(null);
    setCropSrc(await readFileAsDataUrl(file));
  }

  /**
   * Stage the cropped WebP into the hidden file input and submit at once.
   * "Use this frame" IS the upload — the separate third tap that used to
   * follow was routinely missed, leaving hosts thinking the photo had
   * saved (2026-08-22 audit P2-8). The explicit button stays as a retry
   * path if the automatic submit fails.
   */
  function handleCropApply(file: File) {
    const input = photoInputRef.current;
    if (input) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setReady(true);
    setCropSrc(null);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} className="flex flex-col gap-4">
        <input type="hidden" name="experienceId" value={experienceId} />
        <input type="hidden" name="locale" value={locale} />
        {/* Holds the cropped WebP staged via DataTransfer; this is what posts. */}
        <input
          ref={photoInputRef}
          type="file"
          name="photo"
          accept={ACCEPTED_PHOTO_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />

        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h2>
          <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.description}</p>
        </div>

        <div className="bg-sarat-black/5 rounded-image relative aspect-[16/9] w-full max-w-md overflow-hidden">
          {shownUrl ? (
            <Image
              src={shownUrl}
              alt={copy.currentAlt}
              fill
              sizes="(max-width: 768px) 100vw, 28rem"
              className="object-cover"
              unoptimized={previewUrl !== null}
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
              'border-sarat-black/20 hover:border-sarat-black/40 text-sarat-black rounded-button inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 [border-width:0.5px] px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px active:translate-y-0',
            )}
          >
            <ImageUp className="size-4" aria-hidden />
            {shownUrl ? copy.replace : copy.choose}
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_PHOTO_ATTR}
            className="sr-only"
            onChange={(e) => {
              void handlePick(e.target.files?.[0]);
              // Allow re-picking the same file (onChange wouldn't fire again).
              e.target.value = '';
            }}
          />
          <p className="text-sarat-black/40 text-xs">{copy.hint}</p>
        </div>

        {/* Only after a photo is staged — a permanently-disabled gray bar
            before that read as broken, not as "choose a file first". */}
        {ready && <Submit copy={copy} />}

        {error && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {error}
          </p>
        )}
      </form>

      {cropSrc && (
        <HeroCropper
          imageSrc={cropSrc}
          copy={copy.crop}
          onCancel={() => setCropSrc(null)}
          onApply={handleCropApply}
        />
      )}
    </>
  );
}
