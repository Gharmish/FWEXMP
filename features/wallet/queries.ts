import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { guests } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { adminGuard } from '@/features/admin/guard';
import { getWalletBalanceSar, listWalletEntries } from '@/features/wallet/ledger';
import type { WalletAdminView } from '@/features/wallet/types';

/**
 * The guest row owned by the signed-in session, or null. This is the
 * WALLET ownership gate: unlike `bookingViewerCanAccess` it has no
 * cookie fallback — an account-less viewer holding the booking cookie
 * can pay, but never sees or spends a wallet.
 */
export async function getSessionGuestId(): Promise<string | null> {
  if (!serverEnv.DATABASE_URL) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    // Deadline-bounded: runs on the pay page's render path, where a hung
    // pooled connection would stall the page instead of reaching the
    // catch below.
    const guest = await boundedQuery('wallet:sessionGuest', () =>
      db.query.guests.findFirst({
        where: eq(guests.authUserId, user.id),
        columns: { id: true },
      }),
    );
    return guest?.id ?? null;
  } catch (error) {
    reportError(error, { surface: 'wallet:sessionGuest' });
    return null;
  }
}

/** Balance + full ledger for the admin person-360 panel. Degrades to null. */
export async function getWalletAdminView(guestId: string): Promise<WalletAdminView | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const [balanceSar, entries] = await Promise.all([
      getWalletBalanceSar(guestId),
      listWalletEntries(guestId),
    ]);
    return {
      balanceSar,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amountSar: e.amountSar,
        note: e.note,
        expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    reportError(error, { surface: 'wallet:adminView' });
    return null;
  }
}

/**
 * Balance for the signed-in guest's own profile card. Degrades to 0 —
 * the card's copy never promises the number is spendable, and a DB
 * hiccup must not break the profile page. The DATABASE_URL gate also
 * covers degraded `getMyProfile`, whose stub id is an auth id, not a
 * guest uuid.
 */
export async function getMyWalletBalanceSar(guestId: string): Promise<number> {
  if (!serverEnv.DATABASE_URL) return 0;
  try {
    return await getWalletBalanceSar(guestId);
  } catch (error) {
    reportError(error, { surface: 'wallet:myBalance' });
    return 0;
  }
}
