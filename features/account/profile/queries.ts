import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import type { AuthUser } from '@/features/auth/types';
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
 * `guests` row on demand. Order:
 *   1. Already claimed — row whose `authUserId` is this user.
 *   2. Created at booking time, matched by phone — claim it.
 *   3. Otherwise create a fresh row, linked by `authUserId`.
 *
 * Works for both sign-in channels: phone-OTP users carry a phone; email-OTP
 * users have no phone yet, so the row is created phone-less (the column is
 * nullable) and gets a phone when they first book.
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

  // 3. First visit — create the row. Phone may be null (email-OTP users);
  //    they get one when they first book.
  if (!guest) {
    [guest] = await db
      .insert(guests)
      .values({
        authUserId: user.id,
        phone: user.phone || null,
        name: defaultName(user),
        email: user.email ?? null,
      })
      .returning();
  }

  return toProfile(guest);
}
