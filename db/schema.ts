import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Gharmish database schema (BRIEF.md section 8).
 *
 * Conventions: snake_case columns (applied globally via `casing` in
 * drizzle.config.ts and lib/db.ts — keys here stay camelCase). UUID
 * primary keys via `gen_random_uuid()` (Supabase ships pgcrypto).
 * Bilingual content is stored as paired `*En` / `*Ar` columns.
 *
 * Simplification noted for review: availability is modelled inline on
 * `experiences` as a recurring weekday set + blackout dates (BRIEF §8
 * "recurring weekly schedule + blackout dates"), not a separate slots
 * table — kept deliberately minimal for the data-layer task.
 */

/* ----------------------------- Enums ----------------------------- */

export const localeEnum = pgEnum('locale', ['en', 'ar']);

/** Fixed category set — the enum is the source of truth (BRIEF §8). */
export const categoryEnum = pgEnum('category', [
  'nature',
  'heritage',
  'food',
  'wellness',
  'adventure',
  'family',
]);

export const hostVerificationEnum = pgEnum('host_verification', [
  'pending',
  'verified',
  'suspended',
]);

export const experienceStatusEnum = pgEnum('experience_status', [
  'draft',
  /**
   * Host has submitted for review. Not visible publicly. Admin
   * decides → `live` (approve), `draft` (reject), or
   * `changes_requested` (send back with notes).
   */
  'pending_review',
  /**
   * Admin returned the submission with reviewer notes. The host can
   * edit and re-submit (back to `pending_review`) without losing the
   * thread of the conversation.
   */
  'changes_requested',
  'live',
  'paused',
  'archived',
]);

/**
 * Append-only history of moderation decisions on an experience.
 *
 * One row per submit / approve / reject / changes_requested event.
 * The current row in `experiences.status` is the latest *resulting*
 * state; this table preserves the conversation between host and
 * reviewer across multiple cycles (which `host_applications` doesn't
 * need, since that flow is one-shot).
 *
 * `reviewerUserId` is null for host-initiated `submitted` events;
 * set to the admin's Supabase auth id for review decisions.
 */
export const moderationEventEnum = pgEnum('experience_moderation_event', [
  'submitted',
  'approved',
  'rejected',
  'changes_requested',
  // Admin replaced the hero photo. No status change (fromStatus ===
  // toStatus); logged here so the swap is visible in the audit history.
  'photo_updated',
  // Admin edited experience details (price, commission, availability,
  // booking mode, copy, …) from the admin editor. fromStatus may differ
  // from toStatus when the edit also changes status.
  'edited',
]);

/**
 * How a booking is confirmed for an experience:
 *   - `request`: the guest submits a request; the operator/host confirms
 *     it manually (the default — safest for new hosts).
 *   - `instant`: the booking auto-confirms at request time if the chosen
 *     date is on the availability calendar and still has capacity.
 * BRIEF positions Gharmish as a curated marketplace; hosts opt into
 * instant confirmation once their calendar is trustworthy.
 */
export const bookingModeEnum = pgEnum('booking_mode', ['request', 'instant']);

/**
 * Lifecycle events on a host record. Today: suspend / restore. If we
 * later split "verify" out of the host-applications approve action,
 * add a 'verified' value here.
 */
export const hostStatusEventEnum = pgEnum('host_status_event', ['suspended', 'restored']);

/**
 * Per-cycle events on a host application. The application row itself
 * carries the *latest* state; this table preserves every submit and
 * decision across resubmissions, which the single-row fields would
 * overwrite.
 */
export const hostApplicationEventEnum = pgEnum('host_application_event', [
  'submitted',
  'approved',
  'rejected',
]);

/**
 * Booking lifecycle. `pending` is a request-to-book awaiting the host's
 * decision; `declined` (host said no) and `expired` (no decision within
 * the approval window) are its terminal outcomes — distinct from
 * `cancelled` so guests and analytics can tell "the host turned it
 * down" from "someone called it off". Nothing is ever charged for a
 * declined or expired request (pay-after-approval model, 2026-06-10).
 */
export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'refunded',
  'declined',
  'expired',
]);

/**
 * Payment lifecycle for a booking, independent of `bookingStatusEnum`.
 * `unpaid` is the default (and the only value for request-to-book bookings
 * when HyperPay is not configured). `processing` = a HyperPay checkout was
 * created and we're awaiting the result; `paid`/`failed` are set after the
 * server-side status check. Refunds remain tracked via `status=refunded` +
 * `refundedAt`, so there is no `refunded` payment-status value here.
 */
export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'processing',
  'paid',
  'failed',
]);

/**
 * Append-only payment ledger event types. One row per money-touching
 * interaction with the gateway (or per manual money decision), so the
 * sequence of attempts survives — the mutable columns on `bookings`
 * only ever hold the latest state.
 */
export const paymentEventTypeEnum = pgEnum('payment_event_type', [
  'checkout_created',
  /** A still-`processing` booking got a fresh checkout; the old id is logged so late captures on it can be traced. */
  'checkout_superseded',
  'settle_succeeded',
  'settle_failed',
  'refund_attempted',
  'refund_succeeded',
  'refund_failed',
  /** Admin recorded an out-of-band reversal (HyperPay console). */
  'manual_refund_recorded',
]);

/**
 * Host-application workflow. Distinct from `hosts.verificationStatus`:
 * an application is the user-submitted artifact (one per auth user, may
 * be rejected and re-submitted by updating the existing row). When an
 * application is approved, the admin flow mints a `hosts` row from it.
 */
export const hostApplicationStatusEnum = pgEnum('host_application_status', [
  'pending',
  'approved',
  'rejected',
]);

/** Individual vs. registered tourism company (BRIEF §8). */
export const hostIdentityTypeEnum = pgEnum('host_identity_type', ['national_id', 'cr']);

/**
 * Dispute lifecycle. Deliberately two-state: a dispute is either
 * waiting on the team or it isn't. Outcome detail lives in
 * `disputes.adminNotes`, refunds in the booking's own money fields.
 */
export const disputeStatusEnum = pgEnum('dispute_status', ['open', 'resolved']);

/* ----------------------------- Tables ---------------------------- */

export const hosts = pgTable('hosts', {
  id: uuid().defaultRandom().primaryKey(),
  /**
   * Supabase auth id of the host. Unique — one host record per auth
   * user. Nullable so the seeded sample hosts (no real owner) stay
   * valid; live hosts always have it set by the admin-approval flow.
   */
  userId: uuid().unique(),
  name: text().notNull(),
  /**
   * Stable, unique URL slug for /hosts/[slug]. Minted from the display
   * name at approval time with a collision suffix when needed (see
   * features/hosts/lib/slug.ts), so two same-named hosts never share a
   * route. Resolution reads this column rather than deriving from name.
   */
  slug: text().notNull().unique(),
  bioEn: text().notNull(),
  bioAr: text().notNull(),
  photoUrl: text(),
  /** National ID (individual) or CR number (company) — KYC, Sprint 4+. */
  nationalId: text(),
  crNumber: text(),
  verificationStatus: hostVerificationEnum().notNull().default('pending'),
  /** Languages spoken, ISO-ish tags e.g. ['ar','en']. */
  languages: text().array().notNull().default([]),
  /**
   * Operating city. At launch we're Abha-only (BRIEF §2: Asir region
   * first), but the column exists so admin filters and host detail
   * surfaces can sort/group without a second migration when we open
   * more cities. Copied from `host_applications.city` on approval.
   */
  city: text().notNull().default('Abha'),
  region: text().notNull().default('Asir'),
  payoutIban: text(),
  /**
   * Notification email for the host. Copied from the application's
   * `contactEmail` at approval so lifecycle senders (new booking, guest
   * cancellation, payment received) don't depend on the application row
   * surviving. Nullable for seeded demo hosts.
   */
  contactEmail: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const guests = pgTable('guests', {
  id: uuid().defaultRandom().primaryKey(),
  /**
   * Phone is the primary identifier in KSA (BRIEF §8), but nullable: a
   * guest who signs in with email OTP has no phone until they make a
   * booking (the booking form collects one). UNIQUE still holds — Postgres
   * treats NULLs as distinct, so many email-only guests can coexist.
   */
  phone: text().unique(),
  /**
   * Links this guest to the signed-in account (Supabase auth user id, or
   * the stub-session id in dev). Nullable + unique: guests are first
   * created lazily at booking time by phone, then claimed by the account
   * on first profile visit (see features/account/profile/queries.ts).
   */
  authUserId: text().unique(),
  email: text(),
  name: text().notNull(),
  /** Public URL of the profile photo in the Supabase Storage `avatars` bucket. */
  avatarUrl: text(),
  preferredLanguage: localeEnum().notNull().default('ar'),
  /**
   * When an admin suspended this guest (abuse, chargebacks, no-shows).
   * Null = active. A suspended guest can still sign in and browse, but
   * the booking action refuses new bookings.
   */
  suspendedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const experiences = pgTable(
  'experiences',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Stable semantic slug (BRIEF §6), e.g. an-evening-with-the-flower-men. */
    slug: text().notNull().unique(),
    titleEn: text().notNull(),
    titleAr: text().notNull(),
    /** Rich prose for humans + LLMs (BRIEF §6). */
    descriptionEn: text().notNull(),
    descriptionAr: text().notNull(),
    category: categoryEnum().notNull(),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id, { onDelete: 'restrict' }),
    durationMinutes: integer().notNull(),
    maxGroupSize: integer().notNull(),
    minAge: integer().notNull().default(0),
    /** Whole Saudi Riyal per person (currency is always SAR at launch). */
    priceSar: integer().notNull(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    city: text().notNull().default('Abha'),
    region: text().notNull().default('Asir'),
    placeName: text().notNull(),
    inclusions: text().array().notNull().default([]),
    whatToBring: text().array().notNull().default([]),
    cancellationPolicy: text().notNull(),
    /** Recurring weekly availability: weekday indexes 0=Sun..6=Sat. */
    availabilityWeekdays: integer().array().notNull().default([]),
    blackoutDates: date().array().notNull().default([]),
    /**
     * Dates closed to NEW bookings while existing ones are still honored
     * ("stop-sell"). Distinct from blackoutDates (which fully closes a
     * day). A date in here is unbookable but the experience still runs.
     */
    stopSellDates: date().array().notNull().default([]),
    /** Local start time for every occurrence, HH:MM (24h). */
    startTime: text().notNull().default('09:00'),
    /**
     * How bookings are confirmed (BRIEF: curated marketplace). `request`
     * (default) → operator confirms manually; `instant` → auto-confirms
     * against the availability calendar + remaining capacity.
     */
    bookingMode: bookingModeEnum().notNull().default('request'),
    /**
     * Platform commission in basis points (1500 = 15%). The host payout
     * is `totalAmount * (1 - commissionBps/10000)`. Stored as an integer
     * to avoid floating-point money; admin edits it as a percentage.
     */
    commissionBps: integer().notNull().default(1500),
    status: experienceStatusEnum().notNull().default('draft'),
    /** Originals premium tier flag (BRIEF §8). */
    featured: boolean().notNull().default(false),
    /**
     * Canonical hero used by the catalog card (one image, single URL).
     * Lives in the Supabase Storage `photos` bucket at
     * `experiences/{slug}/hero.{ext}`. Nullable so a host can save a
     * draft before the photography session — the publish action soft-
     * gates "live" status on having a hero in a future commit.
     */
    heroImage: text(),
    /**
     * Gallery shown on the detail page after the hero.
     * Bucket path: `experiences/{slug}/gallery-{n}.{ext}`. BRIEF §3
     * calls for 4:5 / 16:9 / square crops — Cloudflare Images is the
     * planned transform layer; until then, hosts upload a 16:9 hero
     * and 4:5 gallery directly.
     */
    images: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Catalog/home filter live (+ featured Originals) experiences by status.
    index('experiences_status_idx').on(t.status),
    // Admin host detail, payouts, moderation join/filter by host.
    index('experiences_host_idx').on(t.hostId),
  ],
);

export const moments = pgTable(
  'moments',
  {
    id: uuid().defaultRandom().primaryKey(),
    experienceId: uuid()
      .notNull()
      .references(() => experiences.id, { onDelete: 'cascade' }),
    orderIndex: integer().notNull(),
    timeOfDay: text(),
    titleEn: text().notNull(),
    titleAr: text().notNull(),
    descriptionEn: text().notNull(),
    descriptionAr: text().notNull(),
    photoUrl: text(),
  },
  // Always loaded by experience, ordered by orderIndex.
  (t) => [index('moments_experience_order_idx').on(t.experienceId, t.orderIndex)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid().defaultRandom().primaryKey(),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'restrict' }),
    experienceId: uuid()
      .notNull()
      .references(() => experiences.id, { onDelete: 'restrict' }),
    date: date().notNull(),
    /** Local start time, HH:MM (24h). */
    startTime: text().notNull(),
    partySize: integer().notNull(),
    totalAmount: integer().notNull(),
    /**
     * Platform commission in basis points, SNAPSHOTTED from the
     * experience at booking time. Payouts and earnings compute from
     * this — an admin editing `experiences.commissionBps` later applies
     * to future bookings only, never restating what a host is owed (or
     * was already paid) for existing ones.
     */
    commissionBps: integer().notNull().default(1500),
    currency: text().notNull().default('SAR'),
    status: bookingStatusEnum().notNull().default('pending'),
    /**
     * Payment state for online card/Mada payment via HyperPay. `unpaid`
     * for request-to-book bookings (and whenever HyperPay is unconfigured).
     */
    paymentStatus: paymentStatusEnum().notNull().default('unpaid'),
    /** HyperPay payment id (`ndc`), set after a successful status check. */
    paymentReference: text(),
    /** HyperPay COPYandPAY checkout id, set when the checkout is prepared. */
    checkoutId: text(),
    /** Card scheme returned by HyperPay (e.g. `MADA`, `VISA`, `MASTER`). */
    paymentBrand: text(),
    /** When payment was confirmed paid. Null until settled. */
    paidAt: timestamp({ withTimezone: true }),
    /**
     * For payment-required bookings, when the unpaid hold expires. Set only
     * when the booking is created and routed to online payment; null for
     * request-to-book and payment-off bookings (which never auto-expire). The
     * release job cancels an `unpaid` booking past this — never a `processing`
     * one (a checkout exists → payment may be in flight), so there is no
     * late-settlement race.
     */
    paymentDeadline: timestamp({ withTimezone: true }),
    /**
     * Request-to-book: when the host's window to approve/decline closes.
     * Stamped at request creation from `platform_settings.
     * approval_window_hours`; the cron flips `pending` rows past it to
     * `expired`. Null for instant bookings (no approval step).
     */
    approvalDeadline: timestamp({ withTimezone: true }),
    /**
     * When the host (or admin) approved the request — feeds the
     * "responds within X hours" host stat. Null for instant bookings
     * and undecided/declined requests.
     */
    approvedAt: timestamp({ withTimezone: true }),
    /** Safe retries for AI agents (BRIEF §6). */
    idempotencyKey: text().notNull().unique(),
    /**
     * Short human reference (`GH-7K3M9X`) — what guests see, quote to
     * support, and forward to each other. Display identity only; URLs
     * and lookups keep the unguessable `idempotencyKey` capability.
     * Unambiguous alphabet (no 0/O/1/I/L/U).
     */
    referenceCode: text().notNull().unique(),
    /**
     * When the admin moved this booking to `refunded`. Null for any
     * booking that was never refunded. Analytics windows refunds by
     * this column (so a 60-day-old booking refunded today shows up in
     * `last7d.refunded`); falls back to `createdAt` for legacy rows
     * that were already `refunded` before this column existed.
     */
    refundedAt: timestamp({ withTimezone: true }),
    /**
     * Whole-SAR amount we still owe back to the guest after a
     * cancellation whose automatic gateway refund failed (or wasn't
     * possible). Null = nothing owed. The admin reverses the charge
     * manually in the HyperPay console, then records it with the
     * refund action (which moves the booking to `refunded` and clears
     * this marker's relevance).
     */
    refundDueSar: integer(),
    /**
     * When the day-before reminder email went out. Null = not sent
     * (or guest has no email). The cron stamps it so re-runs in the
     * same day never double-send.
     */
    reminderSentAt: timestamp({ withTimezone: true }),
    /**
     * When the host was paid out for this booking. Null = still owed.
     * The payout amount is derived from the booking's snapshotted
     * commission split (`splitCommission(totalAmount, commissionBps)`).
     */
    hostPaidAt: timestamp({ withTimezone: true }),
    /** The payout batch this booking was settled in. Null = not yet paid out. */
    payoutId: uuid(),
    /**
     * Client IP at creation (first hop of x-forwarded-for). Used only
     * to rate-limit anonymous booking spam — bookings need no account
     * and no payment to hold capacity, so creation must be throttled.
     * Never rendered in any UI or export.
     */
    createdIp: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Capacity sum on (experience, date) over active statuses — the hot
    // path for every instant booking, admin confirm, and date picker.
    index('bookings_experience_date_status_idx').on(t.experienceId, t.date, t.status),
    // Guest booking history.
    index('bookings_guest_idx').on(t.guestId),
    // Admin list/analytics filters by status.
    index('bookings_status_idx').on(t.status),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** One review per completed booking (BRIEF §8). */
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'restrict' }),
    experienceId: uuid()
      .notNull()
      .references(() => experiences.id, { onDelete: 'cascade' }),
    /** 1–5; enforced in app + a CHECK added in migration review. */
    rating: integer().notNull(),
    textEn: text(),
    textAr: text(),
    photos: text().array().notNull().default([]),
    hostReply: text(),
    /** 24h edit cooldown window (BRIEF §8). */
    editableUntil: timestamp({ withTimezone: true }).notNull(),
    /**
     * When an admin hid this review (abuse / off-policy). Null = visible.
     * Public queries (catalog rating + detail) must exclude hidden rows.
     */
    hiddenAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Detail page listing + rating aggregate, and the catalog ratings join.
    index('reviews_experience_idx').on(t.experienceId),
    // "Reviews I've left" on the guest profile.
    index('reviews_guest_idx').on(t.guestId),
  ],
);

/**
 * Host applications (BRIEF §8 "Host" + §10 Sprint 4+: real onboarding).
 *
 * One row per Supabase auth user (`userId` unique). A user can refile
 * after rejection by re-submitting — the existing row is updated rather
 * than appended, so we keep a single record of the user's intent.
 *
 * Approval is a separate admin flow (not in this PR): on approval the
 * admin creates a `hosts` row with the application's identity fields
 * and sets `host_applications.status = 'approved'`. Photos / MoT
 * licence / insurance / payout details are gathered out-of-band until
 * the file-upload pipeline lands (R2, Nafath KYC — BRIEF §5 + §10).
 */
export const hostApplications = pgTable(
  'host_applications',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Supabase auth user id — unique, one application per user. */
    userId: uuid().notNull().unique(),
    /** Canonical E.164 phone, copied from the auth user at submit time. */
    contactPhone: text().notNull(),
    contactEmail: text(),
    /** Display name as the host would like to appear in the catalog. */
    displayName: text().notNull(),
    /** English bio. Arabic is collected later (translation team / host edits). */
    bioEn: text().notNull(),
    bioAr: text(),
    /** Languages spoken, ISO-ish tags e.g. ['ar','en']. */
    languages: text().array().notNull().default([]),
    identityType: hostIdentityTypeEnum().notNull(),
    identityNumber: text().notNull(),
    city: text().notNull().default('Abha'),
    region: text().notNull().default('Asir'),
    status: hostApplicationStatusEnum().notNull().default('pending'),
    reviewerNotes: text(),
    /** Supabase auth id of the admin who approved/rejected. Audit trail. */
    reviewedByUserId: uuid(),
    reviewedAt: timestamp({ withTimezone: true }),
    /** When approved, the `hosts.id` row that was minted from this application. */
    hostId: uuid().references(() => hosts.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Admin moderation queue filters applications by status.
    index('host_applications_status_idx').on(t.status),
  ],
);

/**
 * Moderation event log for experiences. See `moderationEventEnum`.
 * Append-only — newest row tells the story of the current state.
 */
export const experienceModerationEvents = pgTable(
  'experience_moderation_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    experienceId: uuid()
      .notNull()
      .references(() => experiences.id, { onDelete: 'cascade' }),
    event: moderationEventEnum().notNull(),
    /** Status the experience was in immediately before this event fired. */
    fromStatus: experienceStatusEnum().notNull(),
    /** Status the experience was set to as a result of this event. */
    toStatus: experienceStatusEnum().notNull(),
    /** Supabase auth id of the admin who acted. Null on host-submitted events. */
    reviewerUserId: uuid(),
    /**
     * Free-text reviewer note. Required on `rejected` and
     * `changes_requested` (the host needs to know what to fix),
     * optional on `approved`, always null on `submitted`.
     */
    reviewerNotes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // History timeline for an experience, newest first.
    index('experience_moderation_events_experience_idx').on(t.experienceId, t.createdAt),
  ],
);

/**
 * Append-only audit log of host application decisions. Preserves
 * every submit / approve / reject across resubmission cycles, which
 * `host_applications.reviewerNotes / reviewedAt` would overwrite.
 */
export const hostApplicationEvents = pgTable(
  'host_application_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    applicationId: uuid()
      .notNull()
      .references(() => hostApplications.id, { onDelete: 'cascade' }),
    event: hostApplicationEventEnum().notNull(),
    /** Null on host-initiated `submitted` events; set on admin decisions. */
    reviewerUserId: uuid(),
    /** Free-text. Required by the action layer on `rejected`. */
    reviewerNotes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // History timeline for an application, newest first.
    index('host_application_events_application_idx').on(t.applicationId, t.createdAt),
  ],
);

/**
 * Append-only audit log of host status changes (suspend / restore).
 * Mirrors `experience_moderation_events`: newest row tells the story.
 */
export const hostStatusEvents = pgTable(
  'host_status_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    event: hostStatusEventEnum().notNull(),
    /** Supabase auth id of the admin who acted. */
    reviewerUserId: uuid(),
    /** Optional context — internal-only, never shown to the host. */
    reviewerNotes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // History timeline for a host, newest first.
    index('host_status_events_host_idx').on(t.hostId, t.createdAt),
  ],
);

/**
 * Append-only audit log of payout IBAN changes. Stores MASKED values
 * only (`SA••…1234`) — the point is detecting an unexpected change
 * (compromised account re-routing money), not keeping bank numbers in
 * a second table. The actor is the session user; today only the host
 * edits their own IBAN, but the column doesn't assume that.
 */
export const payoutIbanEvents = pgTable(
  'payout_iban_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    /** Supabase auth id of whoever made the change. */
    actorUserId: uuid().notNull(),
    /** Masked previous value; null when the IBAN was first set. */
    previousIbanMasked: text(),
    newIbanMasked: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // History timeline for a host, newest first.
    index('payout_iban_events_host_idx').on(t.hostId, t.createdAt),
  ],
);

/**
 * Guest-filed disputes ("report a problem"). One row per report,
 * always anchored to a booking — the booking carries the who/what/
 * when context, so the dispute itself is just the guest's message
 * plus the team's resolution trail.
 */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid().defaultRandom().primaryKey(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    /** The guest's own words. Free text, length-capped in the action. */
    message: text().notNull(),
    status: disputeStatusEnum().notNull().default('open'),
    /** Internal resolution notes — never shown to the guest. */
    adminNotes: text(),
    /** Supabase auth id of the admin who resolved. */
    resolvedByUserId: uuid(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The admin queue lists open disputes newest-first.
    index('disputes_status_created_idx').on(t.status, t.createdAt),
    // "Has this booking been reported already?" on the guest page.
    index('disputes_booking_idx').on(t.bookingId),
  ],
);

/**
 * Append-only payment ledger. Never UPDATE or DELETE rows here — the
 * value of the table is that it can't lie about the past. Written by
 * `recordPaymentEvent` (features/payments/ledger.ts) from checkout
 * creation, settlement, refunds, and the admin's manual-refund action.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    type: paymentEventTypeEnum().notNull(),
    /** Whole SAR involved in this event; null for events without an amount. */
    amountSar: integer(),
    /**
     * Gateway identifier: COPYandPAY checkout id for checkout events,
     * HyperPay payment id (`ndc`) for settle/refund events.
     */
    gatewayId: text(),
    /** Raw OPPWA result code, when the event came from a gateway response. */
    resultCode: text(),
    /** Auth user id of the admin who drove the event; null for guest/system flows. */
    actorUserId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The per-booking money timeline, and the reuse/dedupe lookups.
    index('payment_events_booking_idx').on(t.bookingId, t.createdAt),
  ],
);

/**
 * Host payout batches. One row per "Mark paid" action: the amount, the
 * bookings covered (via `bookings.payout_id`), the IBAN the transfer
 * was sent to (snapshotted — the host can change theirs later), and
 * who marked it. `bank_reference` is filled in by the admin when the
 * transfer has a bank-side id worth keeping.
 */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid().defaultRandom().primaryKey(),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id, { onDelete: 'restrict' }),
    amountSar: integer().notNull(),
    bookingCount: integer().notNull(),
    /** Destination IBAN at marking time. */
    payoutIban: text(),
    bankReference: text(),
    /** Auth user id of the admin who marked the batch paid. */
    markedByUserId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payouts_host_idx').on(t.hostId, t.createdAt)],
);

/** Guest wishlist (BRIEF §8: "Saved experiences"). */
export const savedExperiences = pgTable(
  'saved_experiences',
  {
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    experienceId: uuid()
      .notNull()
      .references(() => experiences.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('saved_experiences_guest_experience_unique').on(t.guestId, t.experienceId)],
);

/**
 * Platform-wide settings — a single row (`id = 'platform'`) holding the
 * runtime-configurable knobs an admin owns: the default commission applied
 * to newly created experiences and which categories are bookable. Kept as a
 * fixed-PK singleton so reads/writes are trivial (`where id='platform'` /
 * upsert). Absent row → callers fall back to code defaults, so the app never
 * depends on this row existing.
 */
export const platformSettings = pgTable('platform_settings', {
  id: text().primaryKey().default('platform'),
  /** Default platform commission for NEW experiences, in basis points. */
  defaultCommissionBps: integer().notNull().default(1500),
  /**
   * Free-cancellation window: a guest cancelling at least this many
   * hours before the experience start gets a full refund; closer than
   * this, the booking can still be cancelled but nothing is refunded.
   * Platform-wide (per-experience policies stay prose for now).
   */
  cancellationWindowHours: integer().notNull().default(48),
  /**
   * Request-to-book: how long a host has to approve or decline a
   * request before it auto-expires (owner decision 2026-06-10: 24h).
   */
  approvalWindowHours: integer().notNull().default(24),
  /**
   * Request-to-book: once approved, how long the guest has to complete
   * payment before the hold is released (pay-after-approval model).
   */
  approvalPaymentWindowHours: integer().notNull().default(24),
  /**
   * Optional announcement band on the home page (per locale). Null/
   * empty = no band. Plain text — the band is for "Eid hours" /
   * "Soudah road closed" notices, not rich content.
   */
  announcementEn: text(),
  announcementAr: text(),
  /** Categories currently bookable/visible. Subset of the `category` enum. */
  enabledCategories: categoryEnum()
    .array()
    .notNull()
    .default(sql`ARRAY['nature','heritage','food','wellness','adventure','family']::category[]`),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Admin user id of the last editor (auth user id, not a FK). */
  updatedByAdminId: text(),
  /**
   * Heartbeat: when the release-holds cron last completed. The admin
   * dashboard flags a stale stamp so a silently dead cron is visible.
   * Null until the first run after this column shipped.
   */
  lastCronRunAt: timestamp({ withTimezone: true }),
});

/* --------------------------- Relations --------------------------- */

export const hostsRelations = relations(hosts, ({ many }) => ({
  experiences: many(experiences),
  statusEvents: many(hostStatusEvents),
}));

export const hostStatusEventsRelations = relations(hostStatusEvents, ({ one }) => ({
  host: one(hosts, {
    fields: [hostStatusEvents.hostId],
    references: [hosts.id],
  }),
}));

export const hostApplicationEventsRelations = relations(hostApplicationEvents, ({ one }) => ({
  application: one(hostApplications, {
    fields: [hostApplicationEvents.applicationId],
    references: [hostApplications.id],
  }),
}));

export const guestsRelations = relations(guests, ({ many }) => ({
  bookings: many(bookings),
  reviews: many(reviews),
  saved: many(savedExperiences),
}));

export const experiencesRelations = relations(experiences, ({ one, many }) => ({
  host: one(hosts, { fields: [experiences.hostId], references: [hosts.id] }),
  moments: many(moments),
  bookings: many(bookings),
  reviews: many(reviews),
  savedBy: many(savedExperiences),
  moderationEvents: many(experienceModerationEvents),
}));

export const experienceModerationEventsRelations = relations(
  experienceModerationEvents,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceModerationEvents.experienceId],
      references: [experiences.id],
    }),
  }),
);

export const momentsRelations = relations(moments, ({ one }) => ({
  experience: one(experiences, {
    fields: [moments.experienceId],
    references: [experiences.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
  experience: one(experiences, {
    fields: [bookings.experienceId],
    references: [experiences.id],
  }),
  review: one(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  guest: one(guests, { fields: [reviews.guestId], references: [guests.id] }),
  experience: one(experiences, {
    fields: [reviews.experienceId],
    references: [experiences.id],
  }),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  booking: one(bookings, {
    fields: [paymentEvents.bookingId],
    references: [bookings.id],
  }),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  host: one(hosts, { fields: [payouts.hostId], references: [hosts.id] }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  booking: one(bookings, { fields: [disputes.bookingId], references: [bookings.id] }),
  guest: one(guests, { fields: [disputes.guestId], references: [guests.id] }),
}));

export const savedExperiencesRelations = relations(savedExperiences, ({ one }) => ({
  guest: one(guests, {
    fields: [savedExperiences.guestId],
    references: [guests.id],
  }),
  experience: one(experiences, {
    fields: [savedExperiences.experienceId],
    references: [experiences.id],
  }),
}));

/* ----------------------------- Types ----------------------------- */

export type Host = typeof hosts.$inferSelect;
export type NewHost = typeof hosts.$inferInsert;
export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
export type Experience = typeof experiences.$inferSelect;
export type NewExperience = typeof experiences.$inferInsert;
export type Moment = typeof moments.$inferSelect;
export type NewMoment = typeof moments.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type HostApplication = typeof hostApplications.$inferSelect;
export type NewHostApplication = typeof hostApplications.$inferInsert;
export type ExperienceModerationEvent = typeof experienceModerationEvents.$inferSelect;
export type NewExperienceModerationEvent = typeof experienceModerationEvents.$inferInsert;
export type HostStatusEvent = typeof hostStatusEvents.$inferSelect;
export type NewHostStatusEvent = typeof hostStatusEvents.$inferInsert;
export type HostApplicationEvent = typeof hostApplicationEvents.$inferSelect;
export type NewHostApplicationEvent = typeof hostApplicationEvents.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;
export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
