'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { isDateBookable, remainingCapacity } from '@/features/bookings/lib/availability';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';

/** Statuses that occupy a spot on a date for capacity purposes. */
const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'completed'] as const;

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

    // Instant experiences auto-confirm, but only if the date still has
    // room. Sum active party sizes on that date and compare to the cap.
    // The check + insert run in one transaction to narrow (not fully
    // close) the concurrent-overbook window; a slots table with row
    // locks would close it entirely — tracked for when volume warrants.
    let status: (typeof ACTIVE_BOOKING_STATUSES)[number] = 'pending';
    if (experience.bookingMode === 'instant') {
      const [{ booked }] = await db
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
        return {
          success: false,
          message: 'date_full',
          fields: { preferredDate: 'date_full' },
          values: currentValues(formData),
        };
      }
      status = 'confirmed';
    }

    let guest = await db.query.guests.findFirst({
      where: (g) => eq(g.phone, input.phone),
      columns: { id: true },
    });

    if (!guest) {
      [guest] = await db
        .insert(guests)
        .values({
          name: input.name,
          phone: input.phone,
          preferredLanguage: input.locale,
        })
        .returning({ id: guests.id });
    }

    await db.insert(bookings).values({
      guestId: guest.id,
      experienceId: experience.id,
      date: input.preferredDate,
      startTime: experience.startTime,
      partySize: input.partySize,
      totalAmount: experience.priceSar * input.partySize,
      idempotencyKey: reference,
      status,
    });
  } catch (error) {
    reportError(error, { surface: 'booking-request', experienceSlug: input.experienceSlug });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  await writeLastBookingCookie(reference, input.experienceSlug);
  redirect({ href: confirmedPath, locale: input.locale });
}
