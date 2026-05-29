'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Toggle a single date's blackout (closed) state for an experience.
 *
 * A plain progressive-enhancement form action — clicking a calendar day
 * posts here and the page revalidates. Authorisation: an admin may edit
 * any experience; a host may edit only their own. Anyone else is a
 * silent no-op (no information leak). The calendar is the single source
 * of truth for date exceptions on both the host and admin surfaces.
 */
export async function toggleBlackoutDate(formData: FormData): Promise<void> {
  if (!serverEnv.DATABASE_URL) return;

  const experienceId = formData.get('experienceId');
  const date = formData.get('date');
  if (typeof experienceId !== 'string' || typeof date !== 'string' || !ISO_DATE_RE.test(date)) {
    return;
  }

  try {
    const user = await getCurrentUser();
    if (!user) return;

    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, hostId: true, blackoutDates: true },
    });
    if (!experience) return;

    if (!isAdminUser(user)) {
      const hostId = await getCurrentHostIdForWrite();
      if (!hostId || hostId !== experience.hostId) return; // not owner, not admin
    }

    const set = new Set(experience.blackoutDates);
    if (set.has(date)) set.delete(date);
    else set.add(date);
    const next = [...set].sort();

    await db
      .update(experiences)
      .set({ blackoutDates: next })
      .where(eq(experiences.id, experienceId));
  } catch (error) {
    reportError(error, {
      surface: 'availability:toggleBlackout',
      experienceId: String(experienceId),
    });
    return;
  }

  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}
