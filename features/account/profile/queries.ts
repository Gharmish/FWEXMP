import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import type { AuthUser } from '@/features/auth/types';
import { resolveGuestForUser } from '@/features/account/profile/guest-identity';
import { hostMirrorPatch } from '@/features/account/profile/host-mirror';
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

function toProfile(guest: Guest, host: GuestProfile['host']): GuestProfile {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
    avatarUrl: guest.avatarUrl,
    preferredLanguage: guest.preferredLanguage,
    host,
  };
}

/**
 * When the account also owns a `hosts` row, copy the host's authored
 * details onto whichever guest fields still hold a placeholder (see
 * host-mirror.ts) and hand back the host link for the page. Best-effort:
 * a failure here degrades to the plain guest profile, never to an error.
 */
async function mirrorHostDetails(
  guest: Guest,
  user: AuthUser,
): Promise<{ guest: Guest; host: GuestProfile['host'] }> {
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: {
        slug: true,
        name: true,
        contactEmail: true,
        photoUrl: true,
        verificationStatus: true,
      },
    });
    if (!host) return { guest, host: null };
    const link = { slug: host.slug, verified: host.verificationStatus === 'verified' };

    const patch = hostMirrorPatch(guest, host, defaultName(user));
    if (Object.keys(patch).length === 0) return { guest, host: link };

    const [updated] = await db.update(guests).set(patch).where(eq(guests.id, guest.id)).returning();
    return { guest: updated ?? { ...guest, ...patch }, host: link };
  } catch (error) {
    reportError(error, { surface: 'profile:mirrorHostDetails', guestId: guest.id });
    return { guest, host: null };
  }
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
      host: null,
    };
  }

  const resolved = await resolveGuestForUser(user, { name: defaultName(user) });
  const { guest, host } = await mirrorHostDetails(resolved, user);
  return toProfile(guest, host);
}
