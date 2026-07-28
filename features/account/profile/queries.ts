import { serverEnv } from '@/lib/env';
import type { Guest } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import type { AuthUser } from '@/features/auth/types';
import { resolveGuestForUser } from '@/features/account/profile/guest-identity';
import type { GuestProfile } from '@/features/account/profile/types';

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

/**
 * Placeholder name for accounts that signed in but never booked. Editable.
 * Prefers the phone, then the email local-part, then a generic label.
 */
function defaultName(user: AuthUser): string {
  if (user.phone) return user.phone;
  if (user.email) return user.email.split('@')[0] || user.email;
  return 'Guest';
}

function toProfile(guest: Guest): GuestProfile {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
    avatarUrl: guest.avatarUrl,
    preferredLanguage: guest.preferredLanguage,
  };
}

/**
 * Resolve the signed-in account's profile, creating/linking the backing
 * `guests` row on demand. The linking rules (claim by verified phone
 * only, heal foreign-owned phones, create fresh) live in one place —
 * `resolveGuestForUser` — shared with the booking action so the two
 * paths can never disagree about identity.
 *
 * Returns `null` when signed out. When the DB isn't configured we hand back
 * a non-persisted profile derived from the session so the page can still
 * render (edits then return `no_db`).
 */
export async function getMyProfile(): Promise<GuestProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!hasDb()) {
    return {
      id: user.id,
      name: defaultName(user),
      phone: user.phone || null,
      email: user.email ?? null,
      avatarUrl: null,
      preferredLanguage: 'ar',
    };
  }

  const guest = await resolveGuestForUser(user, { name: defaultName(user) });
  return toProfile(guest);
}
