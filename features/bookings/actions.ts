'use server';

import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { getCurrentUser } from '@/features/auth/queries';
import {
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_HOLD_MINUTES,
  isDateBookable,
  remainingCapacity,
} from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { generateReferenceCode } from '@/features/bookings/lib/reference-code';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';
import {
  sendBookingRequestReceivedEmail,
  sendHostNewBookingEmail,
} from '@/features/bookings/lib/booking-email';
import { getPlatformSettings } from '@/lib/platform-settings';

/** Today as `YYYY-MM-DD` in the experience's local day (KSA at launch). */
function todayInRiyadh(): string {
  // en-CA renders ISO `YYYY-MM-DD`; the time zone pins it to the KSA day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

const LAST_BOOKING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

/**
 * Booking-spam throttles. Bookings need no account and no payment to
 * hold capacity (pending requests and instant payment holds), so
 * creation is rate-limited:
 *   - per phone: at most this many bookings still holding a spot
 *     without payment (`pending`, or `confirmed` and not yet paid);
 *   - per IP: at most this many bookings created in the last hour.
 */
const MAX_ACTIVE_HOLDS_PER_PHONE = 3;
const MAX_BOOKINGS_PER_IP_PER_HOUR = 10;

/**
 * Did this insert lose to an earlier booking with the same idempotency
 * key? postgres.js surfaces unique violations as code 23505 with the
 * constraint name; drizzle may wrap the driver error, so walk the cause
 * chain. Matched by name so a `reference_code` collision (also 23505)
 * still lands in the generic server-error path.
 */
function isIdempotencyReplay(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: unknown; constraint_name?: unknown };
    if (pg.code === '23505' && pg.constraint_name === 'bookings_idempotencyKey_unique') {
      return true;
    }
  }
  return false;
}

/** First hop of x-forwarded-for — the client IP on Vercel. Null locally. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

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
  // `womenOnly` flags a missing eligibility acknowledgment on a women-only
  // experience; it isn't one of the echoed value fields (client-held state).
  fields?: Partial<
    Record<'name' | 'phone' | 'preferredDate' | 'partySize' | 'email' | 'womenOnly', string>
  >;
  // `womenOnly` ('on' | '') is echoed too so the acknowledgment survives a
  // failed-submit form reset (React 19 resets the form after the action).
  values?: Partial<
    Record<'name' | 'phone' | 'preferredDate' | 'partySize' | 'email' | 'womenOnly', string>
  >;
}

const FIELD_NAMES = ['name', 'phone', 'preferredDate', 'partySize', 'email'] as const;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function currentValues(formData: FormData): BookingRequestState['values'] {
  return {
    ...Object.fromEntries(FIELD_NAMES.map((key) => [key, formValue(formData, key)])),
    // Echo the raw acknowledgment so the checkbox re-defaults to checked.
    womenOnly: formValue(formData, 'womenOnly'),
  };
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
    email: formValue(formData, 'email'),
    idempotencyKey: formValue(formData, 'idempotencyKey'),
    utmSource: formValue(formData, 'utmSource'),
    utmMedium: formValue(formData, 'utmMedium'),
    utmCampaign: formValue(formData, 'utmCampaign'),
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
  // The client mints the key when the form mounts (see schemas.ts) so a
  // retry re-sends the same one; server-minted fallback keeps keyless
  // posters working but without retry protection.
  const reference = input.idempotencyKey ?? crypto.randomUUID();
  const slugParam = `slug=${encodeURIComponent(input.experienceSlug)}`;
  const confirmedPath = `/book/confirmed/${reference}?${slugParam}` as const;
  // Where the guest lands depends on the experience's booking mode
  // (pay-after-approval model, owner decision 2026-06-10):
  //   instant + payment on  → the payment step (booking holds the spot
  //                           while the guest pays; confirmed on settle)
  //   request (any payment) → the confirmation page in its "pending host
  //                           approval" state. The guest is NEVER charged
  //                           before the host approves; approval stamps a
  //                           payment deadline and emails a pay link.
  // Resolved after the experience row is loaded; defaults to the
  // confirmation page for the no-DB preview path.
  let nextPath: string = confirmedPath;

  if (!serverEnv.DATABASE_URL) {
    // Preview mode: nothing is persisted, but we still navigate to the
    // confirmation page so the user lands somewhere real. The page
    // renders preview copy when getBookingByReference returns undefined.
    // Stash the reference + slug so /me can show 'your last request'.
    await writeLastBookingCookie(reference, input.experienceSlug);
    redirect({ href: confirmedPath, locale: input.locale });
  }

  // Idempotent-replay fast path: if this key already created a booking, a
  // double-tap or network re-POST is re-delivering a request we already
  // served. Land the guest on the existing booking BEFORE the throttles —
  // the first insert now counts toward them, so re-running the checks
  // would misreport `too_many` for the guest's own booking. Kept outside
  // the main try so redirect()'s control-flow throw can't be caught below;
  // the unique-constraint catch in the insert path is the race-proof
  // backstop for two retries arriving at once. The confirmation page
  // renders every state (incl. awaiting-payment with a pay link), so it's
  // the safe landing for both booking modes.
  if (input.idempotencyKey) {
    let existing = false;
    try {
      existing = Boolean(
        await db.query.bookings.findFirst({
          where: (b) => eq(b.idempotencyKey, reference),
          columns: { id: true },
        }),
      );
    } catch (error) {
      // Lookup hiccup → proceed with the normal flow; the constraint
      // backstop still dedupes.
      reportError(error, { surface: 'booking-request:replayCheck', reference });
    }
    if (existing) {
      await writeLastBookingCookie(reference, input.experienceSlug);
      redirect({ href: confirmedPath, locale: input.locale });
    }
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
        commissionBps: true,
        category: true,
        availabilityWeekdays: true,
        blackoutDates: true,
        stopSellDates: true,
      },
    });

    if (!experience) {
      return { success: false, message: 'notFound', values: currentValues(formData) };
    }

    // Women-only experiences require an explicit eligibility acknowledgment
    // before a booking can be created (owner decision 2026-07-08 category).
    // Enforced server-side so an absent/tampered checkbox can never create a
    // booking; the client gates on the same checkbox for instant feedback.
    if (experience.category === 'women_only' && formValue(formData, 'womenOnly') !== 'on') {
      return {
        success: false,
        message: 'validation',
        fields: { womenOnly: 'required' },
        values: currentValues(formData),
      };
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

    // Throttle creation before any write. Bookings hold capacity with
    // no account and no payment, so both axes are capped: active unpaid
    // holds per phone, and creations per IP per hour.
    const ip = await clientIp();
    const [{ activeForPhone }] = await db
      .select({ activeForPhone: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(
        and(
          eq(guests.phone, input.phone),
          inArray(bookings.status, ['pending', 'confirmed']),
          ne(bookings.paymentStatus, 'paid'),
        ),
      );
    if (activeForPhone >= MAX_ACTIVE_HOLDS_PER_PHONE) {
      return { success: false, message: 'too_many', values: currentValues(formData) };
    }
    if (ip) {
      const [{ recentForIp }] = await db
        .select({ recentForIp: sql<number>`count(*)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.createdIp, ip),
            gte(bookings.createdAt, new Date(Date.now() - 3_600_000)),
          ),
        );
      if (recentForIp >= MAX_BOOKINGS_PER_IP_PER_HOUR) {
        return { success: false, message: 'too_many', values: currentValues(formData) };
      }
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
            columns: { id: true, authUserId: true, phone: true, email: true, suspendedAt: true },
          })
        : undefined) ??
      (await db.query.guests.findFirst({
        where: (g) => eq(g.phone, input.phone),
        columns: { id: true, authUserId: true, phone: true, email: true, suspendedAt: true },
      }));

    // Suspended guests can browse but not book (admin decision trail
    // lives on the guest row). Checked before any insert so a banned
    // phone can't route around the block by signing out.
    if (guest?.suspendedAt) {
      return { success: false, message: 'suspended', values: currentValues(formData) };
    }

    if (!guest) {
      [guest] = await db
        .insert(guests)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email,
          preferredLanguage: input.locale,
          authUserId,
        })
        .returning({
          id: guests.id,
          authUserId: guests.authUserId,
          phone: guests.phone,
          email: guests.email,
          suspendedAt: guests.suspendedAt,
        });
    } else {
      // Backfill the auth link, phone, and/or email on an existing row.
      // Email is set-if-empty — never overwrite a known address from an
      // anonymous form post.
      const patch: Partial<{ authUserId: string; phone: string; email: string }> = {};
      if (authUserId && !guest.authUserId) patch.authUserId = authUserId;
      if (!guest.phone) patch.phone = input.phone;
      if (input.email && !guest.email) patch.email = input.email;
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
      // Snapshot — a later commission edit applies to future bookings only.
      commissionBps: experience.commissionBps,
      idempotencyKey: reference,
      // Human reference (GH-XXXXXX) — display identity only; the UUID
      // above stays the URL capability. Unique-constraint collision is
      // ~1/730M and lands in the generic server-error path.
      referenceCode: generateReferenceCode(),
      createdIp: ip,
      // First-touch acquisition source; feeds only the admin dashboard.
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
    } as const;

    if (experience.bookingMode === 'instant' && hasHyperpay()) {
      nextPath = `/book/${reference}/pay?${slugParam}`;
    }

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
              holdStillCounts(),
            ),
          );
        if (remainingCapacity(experience.maxGroupSize, booked) < input.partySize) {
          return 'full' as const;
        }
        // When online payment is required, stamp a hold deadline: the booking
        // is created `confirmed` (so it holds the spot during payment) but the
        // release job frees it if payment never completes. Null when payment is
        // off — the booking is final on insert and never expires.
        const paymentDeadline = hasHyperpay()
          ? new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000)
          : null;
        await tx
          .insert(bookings)
          .values({ ...bookingValues, status: 'confirmed', paymentDeadline });
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
      // Request mode: no capacity gate at request time — the host (or
      // admin) confirms each request, and capacity is enforced there.
      // The approval window starts now; the cron expires undecided
      // requests past the deadline.
      const { approvalWindowHours } = await getPlatformSettings();
      const approvalDeadline = new Date(Date.now() + approvalWindowHours * 3_600_000);
      await db.insert(bookings).values({ ...bookingValues, status: 'pending', approvalDeadline });
    }
  } catch (error) {
    // Race-proof replay backstop: two concurrent retries can both pass the
    // fast path above; the loser's insert hits the idempotency-key unique
    // constraint. The winner's booking stands — land this caller on it.
    // Emails are the winner's job; skipping them here IS the dedupe.
    if (isIdempotencyReplay(error)) {
      await writeLastBookingCookie(reference, input.experienceSlug);
      redirect({ href: nextPath, locale: input.locale });
    }
    reportError(error, { surface: 'booking-request', experienceSlug: input.experienceSlug });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  // Tell the host and acknowledge the guest — best-effort (a mail hiccup
  // must never fail a booking) AND after the response: each send re-loads
  // the booking + experience and makes a Resend call, which used to sit
  // between the insert and the redirect as pure user-perceived latency on
  // the single most important conversion action. `after()` runs once the
  // redirect has flushed; the function stays alive until it settles.
  after(async () => {
    try {
      await sendHostNewBookingEmail(reference);
    } catch (error) {
      reportError(error, { surface: 'booking-request:hostEmail', reference });
    }
    // Request mode only; no-ops without an email on file.
    try {
      await sendBookingRequestReceivedEmail(reference, input.locale);
    } catch (error) {
      reportError(error, { surface: 'booking-request:guestEmail', reference });
    }
  });

  await writeLastBookingCookie(reference, input.experienceSlug);
  redirect({ href: nextPath, locale: input.locale });
}
