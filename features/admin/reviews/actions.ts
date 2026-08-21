'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateReviewCaches } from '@/lib/cache-tags';
import { z } from 'zod';
import { db } from '@/lib/db';
import { reviews } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminFailureMessage, adminGateRefused, requireAdminActor } from '@/features/admin/guard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hide or unhide a review. Hidden reviews are excluded from the public
 * catalog rating and the detail-page list (see features/reviews/queries
 * — both filter `hidden_at IS NULL`). Toggling stamps/clears
 * `reviews.hidden_at`.
 */
export interface ModerateReviewState {
  success: boolean;
  message?: 'forbidden' | 'no_db' | 'server';
}

export async function setReviewHidden(
  _previous: ModerateReviewState,
  formData: FormData,
): Promise<ModerateReviewState> {
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) return { success: false, message: adminFailureMessage(actor) };

  const hide = formData.get('hide') === 'true';
  const parsed = z.string().regex(UUID_RE).safeParse(formData.get('reviewId'));
  if (!parsed.success) {
    return { success: false, message: 'server' };
  }
  const reviewId = parsed.data;

  try {
    await db
      .update(reviews)
      .set({ hiddenAt: hide ? new Date() : null })
      .where(eq(reviews.id, reviewId));
  } catch (error) {
    reportError(error, { surface: 'admin:setReviewHidden', reviewId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/reviews', 'page');
  // The experience detail + catalog rating change when visibility flips.
  revalidateReviewCaches();
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  return { success: true };
}
