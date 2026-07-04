/**
 * Host profile editing — the host-facing counterpart of the guest
 * account profile (features/account/profile). Covers exactly the
 * fields guests see on /hosts/[slug]: display name, English bio,
 * languages, and the profile photo. Derived surfaces (rating,
 * response stats, joined year, verified badge) are not editable.
 */

export type HostProfileErrorKey = 'no_db' | 'no_auth' | 'validation' | 'server';

export type HostProfileField = 'name' | 'bioEn' | 'languages';

/** `useActionState` shape for the profile details form (discriminated union). */
export type HostProfileFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      message: HostProfileErrorKey;
      fields?: Partial<Record<HostProfileField, true>>;
      values?: { name: string; bioEn: string; languages: string[] };
    };

export type HostPhotoErrorKey =
  | 'no_db'
  | 'no_auth'
  | 'no_storage'
  | 'no_file'
  | 'invalid_type'
  | 'too_large'
  | 'server';

/** `useActionState` shape for photo upload/remove. */
export type HostPhotoActionState =
  | { status: 'idle' }
  | { status: 'success'; photoUrl: string | null }
  | { status: 'error'; message: HostPhotoErrorKey };
