'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateExperienceCaches } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { adminGateRefused, requireAdminActor } from '@/features/admin/guard';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import { redirect, type Locale } from '@/lib/i18n';
import { sanitizeNextPath } from '@/features/auth/lib/next-path';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';

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
  // Where to land after a REFUSED edit (2026-09 engineering audit
  // ACTIONS-04 / GAPA-09): a bare `<form action>` cannot return state, and
  // a refused blackout used to re-render the page unchanged with no word
  // to the host. The calendar posts its own locale-less base path; the
  // refusal redirects back to it with `?calendar=<reason>` for the page
  // to render. Sanitised so the field can never become an open redirect.
  const returnToRaw = formData.get('returnTo');
  const localeRaw = formData.get('locale');
  const locale: Locale = localeRaw === 'ar' ? 'ar' : 'en';
  const returnTo = typeof returnToRaw === 'string' ? sanitizeNextPath(returnToRaw) : null;
  if (
    typeof experienceId !== 'string' ||
    typeof date !== 'string' ||
    !ISO_DATE_RE.test(date) ||
    !op
  ) {
    return;
  }

  let refusal: 'has_bookings' | null = null;
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

    // Admins may edit any experience's calendar, but only with the
    // second factor completed — the same bar as every other admin write
    // (2026-08-21 security audit). An admin who hasn't verified simply
    // falls through to the host-ownership check like anyone else.
    if (adminGateRefused(await requireAdminActor())) {
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
    refusal = await db.transaction(async (tx) => {
      const [experience] = await tx
        .select({
          blackoutDates: experiences.blackoutDates,
          stopSellDates: experiences.stopSellDates,
        })
        .from(experiences)
        .where(eq(experiences.id, experienceId))
        .for('update');
      if (!experience) return null;

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
              // A lapsed unpaid hold frees its seat on the DB clock; it
              // must not block the host either (2026-09 audit GAPA-09).
              holdStillCounts(),
            ),
          );
        if (booked > 0) return 'has_bookings'; // refuse
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
      return null;
    });
  } catch (error) {
    reportError(error, {
      surface: 'availability:setDayAvailability',
      experienceId: String(experienceId),
    });
    return;
  }
  // Outside the try: Next's redirect() throws a control-flow error, and
  // inside it the catch above swallowed the refusal as a server error, so
  // the host saw the page re-render unchanged (2026-09 audit TEST-03 wave 1).
  if (refusal && returnTo && returnTo !== '/') {
    redirect({ href: `${returnTo}?calendar=${refusal}`, locale });
  }

  // The detail page reads blackout/stop-sell dates from the TAGGED data
  // cache (60s backstop); paths alone left a just-closed day rendering as
  // open to guests for up to a minute (2026-09 engineering audit
  // ACTIONS-03).
  revalidateExperienceCaches();
  revalidatePath('/[locale]/host/(dashboard)/experiences/[id]', 'page');
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}
