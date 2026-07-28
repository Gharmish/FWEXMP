'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bookings that block fully closing (blackout) a day. */
const BLOCKING_BOOKING_STATUSES = ['pending', 'confirmed'] as const;

type DayOp = 'open' | 'blackout' | 'stop_sell';

function parseOp(value: FormDataEntryValue | null): DayOp | null {
  if (value === 'open' || value === 'blackout' || value === 'stop_sell') return value;
  return null;
}

/**
 * Set a single date's availability state for an experience. A plain
 * progressive-enhancement form action — clicking a calendar day posts
 * here and the page revalidates.
 *
 *   - `open`       → remove the date from both exception lists.
 *   - `blackout`   → fully close the day. REFUSED if the day has active
 *                    (pending/confirmed) bookings — that would strand
 *                    guests; use `stop_sell` instead.
 *   - `stop_sell`  → close the day to NEW bookings while honoring the
 *                    ones already on it. Always allowed.
 *
 * Authorisation: an admin may edit any experience; a host only their
 * own. Anyone else is a silent no-op (no information leak). The calendar
 * is the single source of truth for date exceptions on both surfaces.
 */
export async function setDayAvailability(formData: FormData): Promise<void> {
  if (!serverEnv.DATABASE_URL) return;

  const experienceId = formData.get('experienceId');
  const date = formData.get('date');
  const op = parseOp(formData.get('op'));
  if (
    typeof experienceId !== 'string' ||
    typeof date !== 'string' ||
    !ISO_DATE_RE.test(date) ||
    !op
  ) {
    return;
  }

  try {
    const user = await getCurrentUser();
    if (!user) return;

    // Ownership check on a plain read first (cheap, no lock held while
    // resolving the host).
    const owned = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, hostId: true },
    });
    if (!owned) return;

    if (!isAdminUser(user)) {
      const hostId = await getCurrentHostIdForWrite();
      if (!hostId || hostId !== owned.hostId) return; // not owner, not admin
    }

    // One transaction, experience row locked FOR UPDATE (2026-07-28
    // audit): the read-modify-write on the exception arrays used to be
    // lock-free, so (a) two rapid day edits could silently drop each
    // other's change (last write wins on the whole array), and (b) the
    // "no blackout with live bookings" guard was check-then-write while
    // booking creation serializes on this same row lock — a booking
    // committed between the count and the write could land on a
    // blacked-out day. Taking the same lock closes both.
    await db.transaction(async (tx) => {
      const [experience] = await tx
        .select({
          blackoutDates: experiences.blackoutDates,
          stopSellDates: experiences.stopSellDates,
        })
        .from(experiences)
        .where(eq(experiences.id, experienceId))
        .for('update');
      if (!experience) return;

      const blackout = new Set(experience.blackoutDates);
      const stopSell = new Set(experience.stopSellDates);

      if (op === 'blackout') {
        // Never fully close a day that has live bookings — that would
        // strand confirmed guests. The UI offers stop-sell instead; this
        // is the authoritative server-side guard (defence in depth).
        const [{ booked }] = await tx
          .select({ booked: sql<number>`count(*)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.experienceId, experienceId),
              eq(bookings.date, date),
              inArray(bookings.status, [...BLOCKING_BOOKING_STATUSES]),
            ),
          );
        if (booked > 0) return; // refuse
        blackout.add(date);
        stopSell.delete(date);
      } else if (op === 'stop_sell') {
        stopSell.add(date);
        blackout.delete(date);
      } else {
        // open
        blackout.delete(date);
        stopSell.delete(date);
      }

      await tx
        .update(experiences)
        .set({ blackoutDates: [...blackout].sort(), stopSellDates: [...stopSell].sort() })
        .where(eq(experiences.id, experienceId));
    });
  } catch (error) {
    reportError(error, {
      surface: 'availability:setDayAvailability',
      experienceId: String(experienceId),
    });
    return;
  }

  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}
