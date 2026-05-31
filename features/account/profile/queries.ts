import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import type { GuestProfile } from '@/features/account/profile/types';

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

/** Placeholder name for accounts that signed in but never booked. Editable. */
function defaultName(phone: string): string {
  return phone || 'Guest';
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
 * `guests` row on demand. Three paths, in order:
 *   1. Already claimed — row whose `authUserId` is this user.
 *   2. Lazily created at booking time (matched by phone) — claim it by
 *      writing `authUserId`.
 *   3. Signed in but never booked — create a fresh row.
 *
 * Returns `null` when signed out. When the DB isn't configured we hand
 * back a non-persisted profile derived from the session so the page can
 * still render (edits then return `no_db`).
 */
export async function getMyProfile(): Promise<GuestProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!hasDb()) {
    return {
      id: user.id,
      name: defaultName(user.phone),
      phone: user.phone,
      email: user.email ?? null,
      avatarUrl: null,
      preferredLanguage: 'ar',
    };
  }

  // 1. Already linked to this account.
  let guest = await db.query.guests.findFirst({
    where: eq(guests.authUserId, user.id),
  });

  // 2. Created at booking time, matched by phone — claim it.
  if (!guest && user.phone) {
    const byPhone = await db.query.guests.findFirst({
      where: eq(guests.phone, user.phone),
    });
    if (byPhone && !byPhone.authUserId) {
      [guest] = await db
        .update(guests)
        .set({ authUserId: user.id })
        .where(eq(guests.id, byPhone.id))
        .returning();
    } else {
      guest = byPhone;
    }
  }

  // 3. First visit, no booking yet — create the record. Requires a phone
  //    (the not-null KSA identifier); without one we can't persist, so we
  //    return a transient profile instead.
  if (!guest) {
    if (!user.phone) {
      return {
        id: user.id,
        name: defaultName(user.phone),
        phone: user.phone,
        email: user.email ?? null,
        avatarUrl: null,
        preferredLanguage: 'ar',
      };
    }
    [guest] = await db
      .insert(guests)
      .values({
        authUserId: user.id,
        phone: user.phone,
        name: defaultName(user.phone),
        email: user.email ?? null,
      })
      .returning();
  }

  return toProfile(guest);
}
