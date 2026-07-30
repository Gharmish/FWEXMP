'use server';

import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, experiences, guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { bookingRequestSchema } from '@/features/bookings/schemas';
import { getCurrentUser } from '@/features/auth/queries';
import { isUniqueViolation, resolveGuestForUser } from '@/features/account/profile/guest-identity';
import {
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_HOLD_MINUTES,
  isDateBookable,
  remainingCapacity,
} from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { generateReferenceCode } from '@/features/bookings/lib/reference-code';
import { policySnapshotFor } from '@/features/bookings/lib/policy';
import {
  LAST_BOOKING_COOKIE,
  parseLastBookingCookie,
  serializeLastBookingCookie,
} from '@/features/account/cookie';
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

/** Current wall-clock time as minutes since midnight in the KSA day. */
function nowMinutesInRiyadh(): number {
  // hourCycle h23 forces 00–23 (dodges the legacy '24' hour bug).
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
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

/**
 * The per-phone throttle's definition of a booking that still holds a
 * spot without payment. Shared by the count that trips `too_many` and
 * the lookup that shows the guest which bookings are holding it.
 */
function activePhoneHolds(phone: string) {
  return and(
    eq(guests.phone, phone),
    inArray(bookings.status, ['pending', 'confirmed']),
    ne(bookings.paymentStatus, 'paid'),
    holdStillCounts(),
    sql`not (${bookings.status} = 'pending' and ${bookings.approvalDeadline} is not null and ${bookings.approvalDeadline} <= now())`,
  );
}

/**
 * The open bookings behind a tripped throttle, but only when the caller
 * verifiably owns them: a signed-in account whose linked guest row holds
 * the submitted phone sees all of them; otherwise the device's
 * last-booking cookie vouches for (at most) the one booking it points
 * at. Anything less verified returns [] and the form stays generic —
 * typing someone else's phone number must never list their bookings.
 * Best-effort: any failure degrades to the generic message.
 */
async function verifiedOpenBookings(
  phone: string,
  locale: 'en' | 'ar',
): Promise<OpenBookingSummary[]> {
  try {
    const rows = await db
      .select({
        reference: bookings.idempotencyKey,
        referenceCode: bookings.referenceCode,
        experienceSlug: experiences.slug,
        titleEn: experiences.titleEn,
        titleAr: experiences.titleAr,
        date: bookings.date,
        status: bookings.status,
        paymentDeadline: bookings.paymentDeadline,
      })
      .from(bookings)
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(activePhoneHolds(phone))
      .orderBy(desc(bookings.createdAt))
      .limit(5);
    if (rows.length === 0) return [];

    const toSummary = (row: (typeof rows)[number]): OpenBookingSummary => ({
      reference: row.reference,
      referenceCode: row.referenceCode,
      experienceSlug: row.experienceSlug,
      title: locale === 'ar' ? row.titleAr : row.titleEn,
      date: row.date,
      // A pending row awaits the host; a confirmed row with a payment
      // deadline awaits payment; confirmed without one (payments off)
      // just sits until its date — nothing to pay, only cancellable.
      state:
        row.status === 'pending'
          ? 'approval'
          : row.paymentDeadline !== null
            ? 'payment'
            : 'confirmed',
    });

    const user = await getCurrentUser();
    if (user) {
      const own = await db.query.guests.findFirst({
        where: (g) => eq(g.authUserId, user.id),
        columns: { phone: true },
      });
      if (own?.phone === phone) return rows.map(toSummary);
    }

    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    const cookieRow = hint ? rows.find((row) => row.reference === hint.reference) : undefined;
    return cookieRow ? [toSummary(cookieRow)] : [];
  } catch (error) {
    reportError(error, { surface: 'bookings:verifiedOpenBookings' });
    return [];
  }
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
 * An open booking shown back to a throttled guest so the `too_many`
 * error is a way forward (finish or cancel it) instead of a dead end.
 * Only bookings whose ownership is verifiable server-side — the
 * signed-in account's own guest row, or this device's last-booking
 * cookie — are ever returned: the submitted phone alone is unverified
 * input and must not let anyone enumerate someone else's bookings.
 */
export interface OpenBookingSummary {
  /** Unguessable booking capability (idempotencyKey) — keys the /book/confirmed URL. */
  reference: string;
  /** Human reference (GH-XXXXXX), display only. */
  referenceCode: string;
  experienceSlug: string;
  /** Experience title, already picked for the form's locale. */
  title: string;
  /** Experience date, `YYYY-MM-DD`. */
  date: string;
  /** What "open" means for this row — drives the status line in the form. */
  state: 'payment' | 'approval' | 'confirmed';
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
  /** Set with `message: 'too_many'` when ownership could be verified. */
  openBookings?: OpenBookingSummary[];
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
        bookingCutoffHours: true,
        bookingMode: true,
        commissionBps: true,
        cancellationTier: true,
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
    // request for a day the experience never runs is not actionable. The
    // startTime + now-minutes + cutoff inputs also close today's slot once
    // we're within the lead time of (or past) its local start, so a payment
    // can never be taken for an experience that has already begun.
    const bookable = isDateBookable({
      dateStr: input.preferredDate,
      todayStr: todayInRiyadh(),
      availabilityWeekdays: experience.availabilityWeekdays,
      blackoutDates: experience.blackoutDates,
      stopSellDates: experience.stopSellDates,
      startTime: experience.startTime,
      nowMinutes: nowMinutesInRiyadh(),
      cutoffMinutes: experience.bookingCutoffHours * 60,
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
    // holds per phone, and creations per IP per hour. Lapsed holds are
    // excluded the same way capacity sums exclude them (`holdStillCounts`,
    // plus requests past their approval deadline): the release cron flips
    // them to cancelled/expired only on its own cadence, and until then an
    // abandoned checkout must not lock the guest out of booking again.
    const ip = await clientIp();
    const [{ activeForPhone }] = await db
      .select({ activeForPhone: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(activePhoneHolds(input.phone));
    if (activeForPhone >= MAX_ACTIVE_HOLDS_PER_PHONE) {
      return {
        success: false,
        message: 'too_many',
        openBookings: await verifiedOpenBookings(input.phone, input.locale),
        values: currentValues(formData),
      };
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

    // Resolve the guest for this booking. Signed-in accounts resolve
    // through the shared identity chokepoint (auth id first, then a claim
    // by the session's OTP-VERIFIED phone only — see guest-identity.ts).
    // The phone typed into the form is unverified and must never link a
    // row to an account: the old phone-match + authUserId backfill here
    // let anyone bind a stranger's bookings, PII, and wallet credit to
    // their own session just by knowing the number.
    // Anonymous bookings keep the phone-keyed lazy row, never linked.
    const user = await getCurrentUser();

    let guest: Pick<Guest, 'id' | 'authUserId' | 'phone' | 'email' | 'suspendedAt'> | undefined =
      user
        ? await resolveGuestForUser(user, {
            name: input.name,
            email: input.email || null,
            preferredLanguage: input.locale,
          })
        : await db.query.guests.findFirst({
            where: (g) => eq(g.phone, input.phone),
            columns: { id: true, authUserId: true, phone: true, email: true, suspendedAt: true },
          });

    // Suspended guests can browse but not book (admin decision trail
    // lives on the guest row). Checked before any insert so a banned
    // phone can't route around the block by signing out.
    if (guest?.suspendedAt) {
      return { success: false, message: 'suspended', values: currentValues(formData) };
    }

    if (!guest) {
      // Anonymous first booking — `authUserId` stays null; accounts only
      // ever link through a verified phone (guest-identity.ts).
      [guest] = await db
        .insert(guests)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email,
          preferredLanguage: input.locale,
        })
        .returning({
          id: guests.id,
          authUserId: guests.authUserId,
          phone: guests.phone,
          email: guests.email,
          suspendedAt: guests.suspendedAt,
        });
    } else {
      // Backfill contact fields only — never identity fields, and NEVER
      // a phone onto an account-linked row.
      //
      // 2026-07-28 re-audit: stamping the form phone on a row with an
      // `authUserId` reopened the takeover from the other side. An
      // email-OTP attacker whose row has no phone could write a
      // victim's number onto their OWN account row; the anonymous
      // branch above then matches that row by phone, so every later
      // anonymous booking the victim makes lands in the ATTACKER's
      // account (their /me, their cancel rights, their wallet on
      // refund, their inbox for the emails). A phone only ever reaches
      // an account row through a verified OTP sign-in
      // (guest-identity.ts); an unverified form value never does.
      //
      // Anonymous rows (authUserId null) still take the phone: the row
      // was created by this same form, hosts read `guests.phone` to
      // reach the guest, and there is no account to hijack.
      const patch: Partial<{ phone: string; email: string }> = {};
      if (!guest.phone && !guest.authUserId) patch.phone = input.phone;
      if (input.email && !guest.email) patch.email = input.email;
      if (Object.keys(patch).length > 0) {
        try {
          await db.update(guests).set(patch).where(eq(guests.id, guest.id));
        } catch (error) {
          if (!isUniqueViolation(error) || !patch.phone) throw error;
          // Another row owns this phone — keep the row phone-less; the
          // booking itself still goes through.
          if (patch.email) {
            await db.update(guests).set({ email: patch.email }).where(eq(guests.id, guest.id));
          }
        }
      }
    }

    const bookingValues = {
      guestId: guest.id,
      experienceId: experience.id,
      date: input.preferredDate,
      startTime: experience.startTime,
      partySize: input.partySize,
      totalAmount: experience.priceSar * input.partySize,
      // Snapshots — a later commission or policy edit applies to future
      // bookings only, never restating an existing booking's terms.
      commissionBps: experience.commissionBps,
      ...policySnapshotFor(experience.cancellationTier),
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
