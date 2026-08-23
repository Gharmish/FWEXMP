/**
 * Host profile editing — the host-facing counterpart of the guest
 * account profile (features/account/profile). Covers exactly the
 * fields guests see on /hosts/[slug]: display name, English + Arabic
 * bio, languages, and the profile photo. Derived surfaces (rating,
 * response stats, joined year, verified badge) are not editable.
 */

export type HostProfileErrorKey = 'no_db' | 'no_auth' | 'validation' | 'server';

export type HostProfileField = 'name' | 'bioEn' | 'bioAr' | 'storyEn' | 'storyAr' | 'languages';

/** `useActionState` shape for the profile details form (discriminated union). */
export type HostProfileFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      message: HostProfileErrorKey;
      fields?: Partial<Record<HostProfileField, true>>;
      values?: {
        name: string;
        bioEn: string;
        bioAr: string;
        storyEn: string;
        storyAr: string;
        languages: string[];
      };
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

export type HostContactField = 'contactPhone' | 'contactEmail' | 'code';

export type HostContactErrorKey =
  | HostProfileErrorKey
  /** Twilio Verify isn't configured — phone changes are refused, never saved unverified. */
  | 'verify_unavailable'
  /** Too many codes requested / too many wrong codes — try later. */
  | 'rate_limited'
  /** The number can't receive a WhatsApp code. */
  | 'phone_unreachable'
  | 'invalid_code'
  /** The code (or the pending change) expired — start again. */
  | 'expired';

/**
 * `useActionState` shape for the contact-details form. A phone change
 * doesn't save on submit: it moves the form to the `verify` step (the
 * email part, if changed, is saved right away), and only a correct code
 * promotes the new number.
 */
export type HostContactFormState =
  | { status: 'idle' }
  | { status: 'success'; message: 'saved' | 'phone_verified' | 'cancelled' }
  | {
      /** A code was sent to `phone`; show the code input. */
      status: 'verify';
      phone: string;
      /** The email was saved in the same submit. */
      emailSaved: boolean;
      /** This was a "send a new code" rather than the first send. */
      resent?: boolean;
    }
  | {
      status: 'error';
      message: HostContactErrorKey;
      /** Keep the code step open when the error belongs to it. */
      step?: 'verify';
      phone?: string;
      fields?: Partial<Record<HostContactField, true>>;
      values?: { contactPhone: string; contactEmail: string };
      /** The email part of the submit was saved before the phone step failed. */
      emailSaved?: boolean;
    };

export type HostNotificationPrefsField = 'channels';

/** `useActionState` shape for the notification-preferences form. */
export type HostNotificationPrefsState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      message: HostProfileErrorKey | 'channel_required' | 'channel_unreachable';
      values?: { email: boolean; whatsapp: boolean; reminders: boolean; reviews: boolean };
    };
