import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import { bookings, experiences, guests, reviews } from '@/db/schema';
import { adminGuard } from '@/features/admin/guard';

/**
 * Admin reviews moderation read-side. Returns every review (visible and
 * hidden) newest-first with the context an operator needs to judge it:
 * the experience, the guest, the rating, and both text bodies.
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export interface AdminReviewRow {
  id: string;
  rating: number;
  textEn: string | null;
  textAr: string | null;
  guestName: string;
  experienceTitleEn: string;
  experienceSlug: string;
  hidden: boolean;
  createdAt: string;
}

const REVIEWS_LIST_LIMIT = 500;

export async function listReviewsForAdmin(): Promise<readonly AdminReviewRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        textEn: reviews.textEn,
        textAr: reviews.textAr,
        hiddenAt: reviews.hiddenAt,
        createdAt: reviews.createdAt,
        guestName: guests.name,
        experienceTitleEn: experiences.titleEn,
        experienceSlug: experiences.slug,
      })
      .from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .innerJoin(guests, eq(guests.id, reviews.guestId))
      .innerJoin(experiences, eq(experiences.id, reviews.experienceId))
      .orderBy(desc(reviews.createdAt))
      .limit(REVIEWS_LIST_LIMIT);

    return rows.map<AdminReviewRow>((row) => ({
      id: row.id,
      rating: row.rating,
      textEn: row.textEn,
      textAr: row.textAr,
      guestName: row.guestName,
      experienceTitleEn: row.experienceTitleEn,
      experienceSlug: row.experienceSlug,
      hidden: row.hiddenAt !== null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    // Rethrow — errors go to the admin boundary, not the empty state.
    reportError(error, { surface: 'admin:listReviews' });
    throw error;
  }
}
