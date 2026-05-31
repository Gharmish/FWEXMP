import type { Locale } from '@/lib/i18n';

/**
 * The signed-in guest's profile, as the account page consumes it.
 * Resolved from the `guests` row claimed by the current auth user
 * (see queries.ts). `phone` is the canonical E.164 KSA identifier.
 */
export interface GuestProfile {
  id: string;
  name: string;
  /** Null for guests who signed in with email and haven't booked yet. */
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  preferredLanguage: Locale;
}

/* ----------------------- Server-action state ----------------------- */

export type ProfileErrorKey = 'no_db' | 'no_auth' | 'validation' | 'server';

/** `useActionState` shape for the profile edit form (discriminated union). */
export type ProfileFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      message: ProfileErrorKey;
      fields?: Partial<Record<'name' | 'email', true>>;
      values?: { name: string; email: string; preferredLanguage: string };
    };

export type AvatarErrorKey =
  | 'no_db'
  | 'no_auth'
  | 'no_storage'
  | 'no_file'
  | 'invalid_type'
  | 'too_large'
  | 'server';

/** `useActionState` shape for avatar upload/remove. */
export type AvatarActionState =
  | { status: 'idle' }
  | { status: 'success'; avatarUrl: string | null }
  | { status: 'error'; message: AvatarErrorKey };
