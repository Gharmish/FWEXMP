'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { getCurrentUser } from '@/features/auth/queries';
import {
  ACTIVE_BOOKING_STATUSES,
  isDateBookable,
  remainingCapacity,
} from '@/features/bookings/lib/availability';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';

/** Today as `YYYY-MM-DD` in the experience's local day (KSA at launch). */
function todayInRiyadh(): string {
  // en-CA renders ISO `YYYY-MM-DD`; the time zone pins it to the KSA day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

const LAST_BOOKING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

async function writeLastBookingCookie(reference: string, experienceSlug: string): Promise<void> {
  const store = await cookies();
  store.set(LAST_BOOKING_COOKIE, serializeLastBookingCookie({ reference, experienceSlug }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LAST_BOOKING_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * The success path throws (Next.js `redirect`) before the action ever
 * returns — so observable state is always one of the error shapes.
 * `success` is kept on the type only to satisfy the useActionState
 * initial value contract.
 */
export interface BookingRequestState {
  success: false;
  message?: string;
  fields?: Partial<Record<'name' | 'phone' | 'preferredDate' | 'partySize', string>>;
  values?: Partial<Record<'name' | 'phone' | 'preferredDate' | 'partySize', string>>;
}

const FIELD_NAMES = ['name', 'phone', 'preferredDate', 'partySize'] as const;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function currentValues(formData: FormData): BookingRequestState['values'] {
  return Object.fromEntries(FIELD_NAMES.map((key) => [key, formValue(formData, key)]));
}

export async function requestBooking(
  _previousState: BookingRequestState,
  formData: FormData,
): Promise<BookingRequestState> {
  const parsed = bookingRequestSchema.safeParse({
    experienceSlug: formValue(formData, 'experienceSlug'),
    locale: formValue(formData, 'locale'),
    name: formValue(formData, 'name'),
    phone: formValue(formData, 'phone'),
    preferredDate: formValue(formData, 'preferredDate'),
    partySize: formValue(formData, 'partySize'),
  });

  if (!parsed.success) {
    const fields: BookingRequestState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && FIELD_NAMES.includes(key as (typeof FIELD_NAMES)[number])) {
        fields[key as keyof typeof fields] = issue.message;
      }
    }
    return {
      success: false,
      message: 'validation',
      fields,
      values: currentValues(formData),
    };
  }

  const input = parsed.data;
  const reference = crypto.randomUUID();
  const confirmedPath =
    `/book/confirmed/${reference}?slug=${encodeURIComponent(input.experienceSlug)}` as const;

  if (!serverEnv.DATABASE_URL) {
    // Preview mode: nothing is persisted, but we still navigate to the
    // confirmation page so the user lands somewhere real. The page
    // renders preview copy when getBookingByReference returns undefined.
    // Stash the reference + slug so /me can show 'your last request'.
    await writeLastBookingCookie(reference, input.experienceSlug);
    redirect({ href: confirmedPath, locale: input.locale });
  }

  try {
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.slug, input.experienceSlug),
      columns: {
        id: true,
        priceSar: true,
        maxGroupSize: true,
        startTime: true,
        bookingMode: true,
        availabilityWeekdays: true,
        blackoutDates: true,
        stopSellDates: true,
      },
    });

    if (!experience) {
      return { success: false, message: 'notFound', values: currentValues(formData) };
    }

    if (input.partySize > experience.maxGroupSize) {
      return {
        success: false,
        message: 'validation',
        fields: { partySize: 'too_large' },
        values: currentValues(formData),
      };
    }

    // The requested day must be open on the calendar for both modes — a
    // request for a day the experience never runs is not actionable.
    const bookable = isDateBookable({
      dateStr: input.preferredDate,
      todayStr: todayInRiyadh(),
      availabilityWeekdays: experience.availabilityWeekdays,
      blackoutDates: experience.blackoutDates,
      stopSellDates: experience.stopSellDates,
    });
    if (!bookable.ok) {
      return {
        success: false,
        message: 'validation',
        fields: { preferredDate: `date_${bookable.reason}` },
        values: currentValues(formData),
      };
    }

    // Resolve the guest for this booking. For a signed-in account, the row
    // is keyed by auth id first — an email-OTP user may already have a
    // phone-less profile row, and `authUserId` is UNIQUE, so we must reuse it
    // (and backfill the phone) rather than insert a colliding second row.
    // Anonymous bookings fall back to phone match, then create.
    const authUserId = (await getCurrentUser())?.id ?? null;

    let guest =
      (authUserId
        ? await db.query.guests.findFirst({
            where: (g) => eq(g.authUserId, authUserId),
            columns: { id: true, authUserId: true, phone: true },
          })
        : undefined) ??
      (await db.query.guests.findFirst({
        where: (g) => eq(g.phone, input.phone),
        columns: { id: true, authUserId: true, phone: true },
      }));

    if (!guest) {
      [guest] = await db
        .insert(guests)
        .values({
          name: input.name,
          phone: input.phone,
          preferredLanguage: input.locale,
          authUserId,
        })
        .returning({ id: guests.id, authUserId: guests.authUserId, phone: guests.phone });
    } else {
      // Backfill the auth link and/or the phone on an existing row.
      const patch: Partial<{ authUserId: string; phone: string }> = {};
      if (authUserId && !guest.authUserId) patch.authUserId = authUserId;
      if (!guest.phone) patch.phone = input.phone;
      if (Object.keys(patch).length > 0) {
        await db.update(guests).set(patch).where(eq(guests.id, guest.id));
      }
    }

    const bookingValues = {
      guestId: guest.id,
      experienceId: experience.id,
      date: input.preferredDate,
      startTime: experience.startTime,
      partySize: input.partySize,
      totalAmount: experience.priceSar * input.partySize,
      idempotencyKey: reference,
    } as const;

    if (experience.bookingMode === 'instant') {
      // Instant experiences auto-confirm, but only if the date still has
      // room. Lock the experience row for the duration of the transaction
      // so concurrent bookings for the same experience serialize: each
      // re-sums active party sizes on the date and inserts only if there
      // is room. This *closes* the overbook window (a read-then-write
      // TOCTOU otherwise) rather than merely narrowing it. Capacity is
      // derived from bookings, so the experience row is the lock anchor.
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select 1 from ${experiences} where ${experiences.id} = ${experience.id} for update`,
        );
        const [{ booked }] = await tx
          .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.experienceId, experience.id),
              eq(bookings.date, input.preferredDate),
              inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
            ),
          );
        if (remainingCapacity(experience.maxGroupSize, booked) < input.partySize) {
          return 'full' as const;
        }
        await tx.insert(bookings).values({ ...bookingValues, status: 'confirmed' });
        return 'ok' as const;
      });
      if (outcome === 'full') {
        return {
          success: false,
          message: 'date_full',
          fields: { preferredDate: 'date_full' },
          values: currentValues(formData),
        };
      }
    } else {
      // Request mode: no capacity gate at request time — an admin
      // confirms each request, and capacity is enforced there.
      await db.insert(bookings).values({ ...bookingValues, status: 'pending' });
    }
  } catch (error) {
    reportError(error, { surface: 'booking-request', experienceSlug: input.experienceSlug });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  await writeLastBookingCookie(reference, input.experienceSlug);
  redirect({ href: confirmedPath, locale: input.locale });
}
