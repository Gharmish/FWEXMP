import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { reportError } from '@/lib/log';
import type { AuthUser } from '@/features/auth/types';

/** Values used only when a fresh row has to be created. */
export interface GuestSeed {
  name: string;
  email?: string | null;
  preferredLanguage?: Guest['preferredLanguage'];
}

/** Postgres unique violation (23505), anywhere in drizzle's cause chain. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/**
 * Resolve (creating or claiming on demand) the single `guests` row that
 * belongs to a signed-in account.
 *
 * Identity rules — the ONLY place they live:
 *   1. A row already linked by `authUserId` always wins.
 *   2. Otherwise the session's OTP-verified phone may claim an
 *      *unclaimed* booking-time row. A phone typed into a form is never
 *      an identity key for an account: matching or claiming on it would
 *      let anyone bind a stranger's row (bookings, PII, wallet credit)
 *      to their own session just by knowing the number.
 *   3. A row owned by a *different* account but holding this session's
 *      verified phone is a poisoned state (historic unverified backfill
 *      or a recycled number). Verified evidence wins: the phone is
 *      stripped from the foreign row — never returned, never merged —
 *      and this account gets its own row carrying the number.
 *   4. Otherwise a fresh row is created from `seed`.
 */
export async function resolveGuestForUser(user: AuthUser, seed: GuestSeed): Promise<Guest> {
  // 1. Already claimed by this account.
  const byAuth = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
  if (byAuth) return byAuth;

  const verifiedPhone = user.phone || null;
  if (verifiedPhone) {
    const byPhone = await db.query.guests.findFirst({ where: eq(guests.phone, verifiedPhone) });
    if (byPhone && !byPhone.authUserId) {
      // 2. Anonymous booking-time row — claim it. Conditional on it still
      // being unclaimed so a concurrent claim loses cleanly.
      const [claimed] = await db
        .update(guests)
        .set({ authUserId: user.id })
        .where(and(eq(guests.id, byPhone.id), isNull(guests.authUserId)))
        .returning();
      if (claimed) return claimed;
      // Lost the race — only this same account (same verified phone) can
      // have won it, so the auth-keyed row exists now.
      const rewon = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
      if (rewon) return rewon;
      // Fall through to create (backstopped by the unique-violation retry).
    } else if (byPhone && byPhone.authUserId !== user.id) {
      // 3. Poisoned state — heal it. No phone value in the report (PII).
      reportError(new Error('guest phone held by another account'), {
        surface: 'guest-identity',
        foreignGuestId: byPhone.id,
      });
      await db
        .update(guests)
        .set({ phone: null })
        .where(and(eq(guests.id, byPhone.id), eq(guests.phone, verifiedPhone)));
    }
  }

  // 4. Fresh row for this account.
  try {
    const [created] = await db
      .insert(guests)
      .values({
        authUserId: user.id,
        phone: verifiedPhone,
        name: seed.name,
        email: seed.email ?? user.email ?? null,
        ...(seed.preferredLanguage ? { preferredLanguage: seed.preferredLanguage } : {}),
      })
      .returning();
    return created;
  } catch (error) {
    // Race loser: a concurrent request for this same account created the
    // row (authUserId unique) or claimed the phone first. Reuse theirs.
    if (isUniqueViolation(error)) {
      const existing = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
      if (existing) return existing;
    }
    throw error;
  }
}
