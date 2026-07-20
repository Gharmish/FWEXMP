import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, promoCodes } from '@/db/schema';
import type { Booking, PromoCode } from '@/db/schema';
import { adminGuard } from '@/features/admin/guard';

/**
 * Read side for promo codes. The admin overview derives each code's
 * redemption count and funded-discount total from `bookings` (never a
 * counter column — the same anti-drift stance as capacity), so the cap
 * shown always matches what the apply action enforces.
 */

/**
 * Booking statuses that consume a redemption. A cancelled / declined /
 * expired / refunded booking frees the code back up, so those are
 * excluded here AND in the apply-time cap check — keep the two in sync.
 */
export const PROMO_REDEEMED_STATUSES = [
  'pending',
  'confirmed',
  'completed',
] as const satisfies readonly Booking['status'][];

export interface PromoCodeRow {
  id: string;
  code: string;
  label: string | null;
  discountType: PromoCode['discountType'];
  discountValue: number;
  minTotalSar: number | null;
  maxRedemptions: number | null;
  /** Per-guest redemption cap. Null = unlimited (legacy/explicit). */
  maxRedemptionsPerGuest: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
  /** Live redemptions (bookings in a redeemed status referencing this code). */
  redemptions: number;
  /** Whole-SAR discount funded on paid bookings for this code. */
  discountFundedSar: number;
}

export async function getPromoCodesForAdmin(): Promise<readonly PromoCodeRow[]> {
  const block = await adminGuard();
  if (block) return [];

  const codes = await db.query.promoCodes.findMany({ orderBy: (p) => desc(p.createdAt) });
  if (codes.length === 0) return [];

  // One grouped scan of bookings that reference any of these codes.
  const stats = await db
    .select({
      promoCodeId: bookings.promoCodeId,
      redemptions: sql<number>`count(*) filter (where ${bookings.status} in ('pending','confirmed','completed'))::int`,
      discountFundedSar: sql<number>`coalesce(sum(${bookings.discountSar}) filter (where ${bookings.paymentStatus} = 'paid'), 0)::int`,
    })
    .from(bookings)
    .where(
      inArray(
        bookings.promoCodeId,
        codes.map((c) => c.id),
      ),
    )
    .groupBy(bookings.promoCodeId);

  const byId = new Map(stats.map((s) => [s.promoCodeId, s]));

  return codes.map((c) => {
    const s = byId.get(c.id);
    return {
      id: c.id,
      code: c.code,
      label: c.label,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minTotalSar: c.minTotalSar,
      maxRedemptions: c.maxRedemptions,
      maxRedemptionsPerGuest: c.maxRedemptionsPerGuest,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
      redemptions: s?.redemptions ?? 0,
      discountFundedSar: s?.discountFundedSar ?? 0,
    };
  });
}

/** Does a normalized code already exist? Used to pre-empt the unique-constraint race. */
export async function promoCodeExists(normalizedCode: string): Promise<boolean> {
  const row = await db.query.promoCodes.findFirst({
    where: eq(promoCodes.code, normalizedCode),
    columns: { id: true },
  });
  return Boolean(row);
}
