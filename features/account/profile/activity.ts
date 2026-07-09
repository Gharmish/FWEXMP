import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, disputes, experiences, reviews } from '@/db/schema';
import { reportError } from '@/lib/log';
import { pickLocalized } from '@/lib/ar-placeholder';
import type { Locale } from '@/lib/i18n';

/**
 * Guest self-service activity beyond bookings: the reviews they've
 * written and the disputes they've filed. Both already exist for the
 * admin's User-360 view; these are the same facts surfaced back to the
 * guest on `/me/profile`. Degrade to an empty list on any DB error —
 * the profile page must still render (matches getMyProfile's posture).
 */

export interface GuestReviewItem {
  id: string;
  rating: number;
  text: string | null;
  experienceTitle: string;
  experienceSlug: string;
  hidden: boolean;
  createdAt: string;
}

export interface GuestDisputeItem {
  id: string;
  bookingReference: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export async function getReviewsWrittenByGuest(
  guestId: string,
  locale: Locale,
): Promise<readonly GuestReviewItem[]> {
  if (!serverEnv.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        textEn: reviews.textEn,
        textAr: reviews.textAr,
        hiddenAt: reviews.hiddenAt,
        createdAt: reviews.createdAt,
        titleEn: experiences.titleEn,
        titleAr: experiences.titleAr,
        slug: experiences.slug,
      })
      .from(reviews)
      .innerJoin(experiences, eq(experiences.id, reviews.experienceId))
      .where(eq(reviews.guestId, guestId))
      .orderBy(desc(reviews.createdAt));

    return rows.map((r) => {
      const text = pickLocalized(locale, r.textEn ?? '', r.textAr ?? '');
      return {
        id: r.id,
        rating: r.rating,
        text: text.length > 0 ? text : null,
        experienceTitle: pickLocalized(locale, r.titleEn, r.titleAr),
        experienceSlug: r.slug,
        hidden: r.hiddenAt !== null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  } catch (error) {
    reportError(error, { surface: 'account:getReviewsWrittenByGuest', guestId });
    return [];
  }
}

export async function getDisputesFiledByGuest(
  guestId: string,
): Promise<readonly GuestDisputeItem[]> {
  if (!serverEnv.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: disputes.id,
        message: disputes.message,
        status: disputes.status,
        createdAt: disputes.createdAt,
        reference: bookings.referenceCode,
      })
      .from(disputes)
      .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
      .where(eq(disputes.guestId, guestId))
      .orderBy(desc(disputes.createdAt));

    return rows.map((d) => ({
      id: d.id,
      bookingReference: d.reference,
      message: d.message,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    }));
  } catch (error) {
    reportError(error, { surface: 'account:getDisputesFiledByGuest', guestId });
    return [];
  }
}
