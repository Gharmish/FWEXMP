import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  /** Women-only experiences (owner decision 2026-07-08). */
  'women_only',
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
 * Host-selected cancellation policy preset. The tier is the ONLY
 * enforceable policy input — the numeric windows/percentages it implies
 * live in code (`features/bookings/lib/policy.ts`) and are SNAPSHOTTED
 * onto each booking at creation, so a host switching tiers never
 * changes the rights of an existing booking.
 */
export const cancellationTierEnum = pgEnum('cancellation_tier', ['flexible', 'moderate', 'strict']);

/**
 * Who called a booking off. `guest` = self-service cancellation,
 * `operator` = host/admin lifecycle cancel, `emergency` = the admin
 * emergency flow (force-majeure: weather, host no-show, safety) — which
 * bypasses the policy tiers and always returns the full payment as
 * Gharmish Credit. Null on rows cancelled before this column existed.
 */
export const cancellationKindEnum = pgEnum('cancellation_kind', [
  'guest',
  'operator',
  'emergency',
  /** Automatic releases — e.g. a lapsed payment hold cancelled by the cron. */
  'system',
]);

/**
 * How a refunded booking's money went back: `gateway` = automatic
 * HyperPay reversal to the original card, `wallet` = credited to the
 * guest's Gharmish Credit ledger, `manual` = admin reversed the charge
 * out-of-band (HyperPay console) and recorded it. Null when never
 * refunded (or refunded before this column existed).
 */
export const refundMethodEnum = pgEnum('refund_method', ['gateway', 'wallet', 'manual']);

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
  /** Append-only proof the guest accepted the Terms/Privacy/Cancellation clickwrap before paying; `gatewayId` holds the accepted terms version. */
  'terms_accepted',
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

/** OTP abuse events counted by the auth throttle (see that table). */
export const authThrottleKindEnum = pgEnum('auth_throttle_kind', [
  'send',
  'verify_failed',
  // Promo-code attempt (2026-07-28 audit) — same abuse-event table, see
  // features/promo-codes/lib/throttle.ts. Identifier = guest id.
  'promo_attempt',
]);

/** Delivery channels the notification dispatcher can route to. */
export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'whatsapp']);

/**
 * Delivery lifecycle of one message on one channel. `queued` is the
 * claim (row inserted before the provider call — the dedupe point);
 * `sent` = accepted by the provider; `delivered`/`read` arrive later
 * via provider webhooks (Twilio status callbacks; email stays at
 * `sent` until Resend webhooks land). `failed` = provider rejected or
 * errored; `suppressed` = we refused to send (recipient on the
 * suppression list).
 */
export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'suppressed',
]);

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
  region: text().notNull().default('Aseer'),
  payoutIban: text(),
  /**
   * Notification email for the host. Copied from the application's
   * `contactEmail` at approval so lifecycle senders (new booking, guest
   * cancellation, payment received) don't depend on the application row
   * surviving. Nullable for seeded demo hosts.
   */
  contactEmail: text(),
  /**
   * Notification phone for the host (E.164), the WhatsApp channel's
   * address. Copied from the application's `contactPhone` at approval —
   * same rationale as `contactEmail` — and backfilled from approved
   * applications for hosts minted before this column existed. Nullable
   * for seeded demo hosts.
   */
  contactPhone: text(),
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
   * Last billing address the guest entered at checkout (HyperPay 3DS2
   * requires it). Saved so a returning guest doesn't retype it — the
   * payment step prefills these. All nullable: a guest who never reached
   * a paid checkout has none, and `billingState` is optional for KSA.
   * `billingCountry` is ISO 3166-1 alpha-2.
   */
  billingStreet1: text(),
  billingCity: text(),
  billingState: text(),
  billingPostcode: text(),
  billingCountry: text(),
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
    region: text().notNull().default('Aseer'),
    placeName: text().notNull(),
    inclusions: text().array().notNull().default([]),
    whatToBring: text().array().notNull().default([]),
    /**
     * Legacy free-text policy. No guest surface renders it and the
     * host/admin forms no longer collect it (the tier below replaced
     * it); the empty-string default lets inserts omit it entirely.
     */
    cancellationPolicy: text().notNull().default(''),
    /**
     * Structured cancellation policy preset — the enforced counterpart
     * to the free-text `cancellationPolicy` above (which is display
     * legacy only and slated for removal once every surface renders the
     * tier). Guest cancel/reschedule rights come from the tier's
     * parameters snapshotted onto the booking, never from this column
     * at cancel time.
     */
    cancellationTier: cancellationTierEnum().notNull().default('moderate'),
    /**
     * Admin-authored Arabic for the lists and policy. Empty means "not
     * written yet" — Arabic surfaces fall back to the seed-content
     * dictionary (`toArabicText`) and ultimately to the English text.
     */
    inclusionsAr: text().array().notNull().default([]),
    whatToBringAr: text().array().notNull().default([]),
    cancellationPolicyAr: text().notNull().default(''),
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
     * Booking lead time: hours before `startTime` that new bookings close
     * for a given day (host-settable — a sunrise hike needs more notice
     * than a walk-in coffee). Enforced server-side in the booking action
     * and mirrored in the guest date picker. Default 2 matches the former
     * platform-wide `BOOKING_CUTOFF_MINUTES` (120) so existing listings are
     * unchanged.
     */
    bookingCutoffHours: integer().notNull().default(2),
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
    /**
     * Cancellation-policy snapshot, taken from the experience's
     * `cancellationTier` at booking time (same discipline as
     * `commissionBps`): the tier label plus the numeric parameters it
     * implied THEN. Guest cancel/reschedule eligibility and refund
     * amounts are computed from these columns only — a host or platform
     * policy change never restates an existing booking's rights. The
     * column defaults equal the `moderate` tier, which both backfills
     * legacy rows with the rule they were sold under (48h full refund)
     * and keeps any insert path that forgets the snapshot on the
     * default tier.
     */
    policyTier: cancellationTierEnum().notNull().default('moderate'),
    /** Cancelling ≥ this many hours before start refunds in full. */
    freeCancelHours: integer().notNull().default(48),
    /**
     * After the full-refund deadline, cancelling ≥ this many hours
     * before start refunds `partialRefundBps`; past it the payment is
     * forfeited. Tiers without a partial step set bps to 0.
     */
    partialRefundHours: integer().notNull().default(24),
    partialRefundBps: integer().notNull().default(5000),
    /** Guests may move the booking ≥ this many hours before start. */
    rescheduleCutoffHours: integer().notNull().default(24),
    /**
     * Self-service reschedule bookkeeping: when the guest last moved the
     * booking, the date it moved FROM, and how many moves have been
     * used (policy caps this — see `MAX_RESCHEDULES`). Money never moves
     * on a reschedule, so payment columns are untouched by it.
     */
    rescheduledAt: timestamp({ withTimezone: true }),
    rescheduledFromDate: date(),
    rescheduleCount: integer().notNull().default(0),
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
     * VAT rate in basis points, SNAPSHOTTED at payment settlement (the
     * tax point). Null = no VAT — the payment settled while the platform
     * was below the ZATCA registration threshold (`platform_settings.
     * vat_enabled` off). Prices are VAT-inclusive, so the disclosed
     * portion is `total × rate / (10000 + rate)`, never added on top.
     * Flipping the platform toggle never restates history: receipts and
     * tax invoices render from this column only.
     */
    vatRateBps: integer(),
    /**
     * Seller VAT registration number snapshotted together with the rate,
     * so an issued tax invoice keeps the number it was issued under even
     * if the platform setting later changes.
     */
    vatRegistrationNumber: text(),
    /**
     * Invoice line-item description (experience title, per locale) and
     * buyer name, SNAPSHOTTED at payment settlement. An issued invoice is
     * a legal document — a host renaming the experience (or a guest
     * renaming their profile) must never rewrite it retroactively. Null
     * on legacy rows; the invoice page falls back to live lookups there.
     */
    invoiceItemEn: text(),
    invoiceItemAr: text(),
    billedName: text(),
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
    /**
     * When the host (or admin) declined the request — the decline-side
     * twin of `approvedAt`, so the 24h-SLA metric can time declines too.
     * Null for rows declined before this column existed (the SLA metric
     * skips those) and for every non-declined booking.
     */
    declinedAt: timestamp({ withTimezone: true }),
    /**
     * First-touch UTM attribution, captured client-side from the landing
     * URL (sessionStorage, no cookie — the cookie notice promises none)
     * and submitted with the booking form. Null = organic/unknown. Only
     * ever rendered in the admin dashboard's acquisition breakdown.
     */
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
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
     * Cancellation bookkeeping: when the booking was called off, by whom
     * (`cancellationKind`), and — for the emergency flow, where the note
     * is mandatory — why. All null on rows cancelled before these
     * columns existed and on never-cancelled bookings.
     */
    cancelledAt: timestamp({ withTimezone: true }),
    cancellationKind: cancellationKindEnum(),
    cancellationReason: text(),
    /** How the refund travelled (see `refundMethodEnum`). Null = never refunded. */
    refundMethod: refundMethodEnum(),
    /**
     * Whole-SAR Gharmish Credit redeemed against this booking at
     * checkout. `totalAmount` stays the amount actually CHARGED to the
     * card/Mada, so the full paid base of a wallet-assisted booking is
     * `totalAmount + walletAppliedSar` (and pre-discount list price is
     * that plus `discountSar`).
     *
     * Debit-at-APPLY (owner arbitration 2026-07-19): the redemption
     * ledger row (`redeem:<bookingId>:<n>`, cycle-suffixed because
     * apply→remove→re-apply is legal) commits in the same transaction
     * that reduces `totalAmount`, so a balance can never be promised to
     * two bookings. Every UNPAID death (remove, promo change, hold
     * lapse, cancel/decline) RELEASES the reservation via a `reversal`
     * row (features/wallet/reservation.ts); paid bookings keep the
     * stamp — it feeds payout math, and refunds return the credit leg
     * as `refund_credit` through executeRefund's card-first split.
     * Platform-funded like `discountSar`: the payout base adds it back.
     */
    walletAppliedSar: integer().notNull().default(0),
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
     * Whole-SAR amount actually RETURNED to the guest (card + wallet
     * credit combined), stamped by every refund path. Null = never
     * refunded. Partial policy refunds (`partialRefundBps`) make this
     * less than the paid base — the ZATCA credit note and all refund
     * reporting must render from THIS column, never assume a refund was
     * the full amount (audit fix 2026-07-20).
     */
    refundedAmountSar: integer(),
    /**
     * Whole-SAR amount the platform RETAINED on a cancellation (paid
     * base minus what was refunded): the forfeit of a late cancel, or
     * the withheld half of a partial-tier refund. Null = nothing
     * retained. This is the journal record for forfeit revenue — before
     * it existed (audit fix 2026-07-20), retained cancellation money was
     * invisible to every report.
     */
    forfeitedSar: integer(),
    /**
     * When the ~24h "get ready" reminder email went out. Null = not
     * sent (or guest has no email). The cron stamps it so re-runs never
     * double-send.
     */
    reminderSentAt: timestamp({ withTimezone: true }),
    /**
     * When the ~3h day-of "see you soon" reminder went out. Null = not
     * sent. Separate flag from `reminderSentAt` so the two hourly-cron
     * passes dedupe independently.
     */
    finalReminderSentAt: timestamp({ withTimezone: true }),
    /**
     * When the host was paid out for this booking. Null = still owed.
     * The payout amount is derived from the booking's snapshotted
     * commission split (`splitCommission(totalAmount, commissionBps)`).
     */
    hostPaidAt: timestamp({ withTimezone: true }),
    /**
     * The payout batch this booking was settled in. Null = not yet paid
     * out. The FK (SET NULL) exists in the live DB — declared here too
     * (2026-07-28 audit) so a future `db:generate` diff can never
     * propose dropping it. The live constraint was renamed to drizzle's
     * own convention (`bookings_payout_id_payouts_id_fk`) in the
     * re-audit, since drizzle-kit keys FKs by NAME: under the old
     * hand-made `_fkey` name a diff would still have churned it.
     */
    payoutId: uuid().references(() => payouts.id, { onDelete: 'set null' }),
    /**
     * Promo code redeemed on this booking, if any. `promoCodeId` links to
     * the live row; `promoCode` is the UPPERCASE code SNAPSHOTTED at
     * redemption so history survives an admin renaming or deactivating the
     * promo (the FK is `set null` on delete for the same reason).
     */
    promoCodeId: uuid().references(() => promoCodes.id, { onDelete: 'set null' }),
    promoCode: text(),
    /**
     * Whole-SAR discount applied by the promo code. `totalAmount` is the
     * amount actually charged (post-discount); the pre-discount price is
     * always `totalAmount + discountSar`. Platform-funded (owner decision):
     * the host is paid as if the guest paid full price, so the payout base
     * is `totalAmount + discountSar` and the platform absorbs the discount
     * out of its commission — see `splitCommission` / `payoutExpr`. 0 = no
     * promo.
     */
    discountSar: integer().notNull().default(0),
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
    // The per-IP creation throttle (`WHERE created_ip = ? AND created_at
    // >= now()-1h`) runs on EVERY booking submit, before the capacity
    // transaction — without this it's a sequential scan that grows with
    // the table. Partial: rows without an IP can never match the filter.
    index('bookings_created_ip_created_at_idx')
      .on(t.createdIp, t.createdAt)
      .where(sql`created_ip IS NOT NULL`),
    // The release-holds cron's release/reconcile passes filter on
    // payment_status + payment_deadline daily; without this they scan the
    // whole table. Partial: only unpaid holds carry a deadline worth
    // scanning for.
    index('bookings_payment_deadline_idx')
      .on(t.paymentDeadline)
      .where(sql`payment_deadline IS NOT NULL`),
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
    /** 1–5; zod bounds app writes, the CHECK below backstops raw SQL/seeds. */
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
    // Applied live 2026-07-28 (audit) — the comment above had promised
    // it since the review feature shipped.
    check('reviews_rating_range', sql`rating between 1 and 5`),
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
    /** English bio (required). */
    bioEn: text().notNull(),
    /** Host-authored Arabic bio. Optional — null when the host only wrote English. */
    bioAr: text(),
    /** Languages spoken, ISO-ish tags e.g. ['ar','en']. */
    languages: text().array().notNull().default([]),
    identityType: hostIdentityTypeEnum().notNull(),
    identityNumber: text().notNull(),
    /**
     * KYC fields (owner decision 2026-07-07). All nullable: rows filed
     * before the KYC form shipped don't have them, and the stub-cookie
     * path can't collect uploads. New submissions always fill them —
     * the zod schema is the enforcement point, not the DB.
     */
    /** Full legal name exactly as on the ID (individual) or CR (company). */
    legalName: text(),
    /** Individuals only (18+ gate). Null for CR applicants. */
    dateOfBirth: date(),
    /** Payout IBAN (SA + 22 digits, mod-97 checked). Copied to hosts.payoutIban on approval. */
    iban: text(),
    bankName: text(),
    /** Account holder name on the IBAN letter — must match legalName; admin verifies. */
    bankAccountHolder: text(),
    /** ZATCA VAT registration number (15 digits) — CR applicants, optional. */
    vatNumber: text(),
    /**
     * When the applicant ticked the accuracy + PDPL-consent + full-
     * liability acknowledgment (Gharmish provides no insurance; hosts
     * are solely responsible for their experiences — owner 2026-07-07).
     */
    termsAcceptedAt: timestamp({ withTimezone: true }),
    city: text().notNull().default('Abha'),
    region: text().notNull().default('Aseer'),
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
 * KYC document kinds collected at host onboarding (owner decision
 * 2026-07-07 — no insurance / civil-defense documents; hosts carry
 * full liability for their experiences).
 *
 * Required set depends on `host_applications.identityType`:
 *   - national_id: national_id, iban_letter (tourism_license optional —
 *     the MoT freelance document, encouraged but not a filing blocker)
 *   - cr: cr_certificate, tourism_license, signatory_id, iban_letter
 *     (vat_certificate optional, only if VAT-registered)
 */
export const hostDocumentTypeEnum = pgEnum('host_document_type', [
  'national_id',
  'cr_certificate',
  'tourism_license',
  'signatory_id',
  'vat_certificate',
  'iban_letter',
]);

/**
 * Per-document review state, independent of the application decision.
 * A re-uploaded document resets to `pending`; documents not re-uploaded
 * on resubmission keep their prior verdict.
 */
export const hostDocumentStatusEnum = pgEnum('host_document_status', [
  'pending',
  'approved',
  'rejected',
]);

/**
 * One row per (application, document type) — a re-upload replaces the
 * row in place (and best-effort deletes the old storage object), so the
 * table always holds the *current* document. Objects live in the
 * private `kyc-documents` bucket under `{userId}/{type}-{ts}.{ext}`;
 * admin review reads them via short-lived signed URLs, never public.
 */
export const hostApplicationDocuments = pgTable(
  'host_application_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    applicationId: uuid()
      .notNull()
      .references(() => hostApplications.id, { onDelete: 'cascade' }),
    type: hostDocumentTypeEnum().notNull(),
    /** Object key inside the `kyc-documents` bucket. */
    objectKey: text().notNull(),
    /** Original file name, for the admin review surface only. */
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    status: hostDocumentStatusEnum().notNull().default('pending'),
    /** Reviewer note — required by the action layer on per-doc reject. */
    reviewerNotes: text(),
    reviewedByUserId: uuid(),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('host_application_documents_application_type_uq').on(t.applicationId, t.type),
    index('host_application_documents_application_idx').on(t.applicationId),
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
    // RESTRICT, not cascade (matches payment_events): a complaint trail
    // can justify refunds — deleting the booking or guest must not
    // silently erase it.
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'restrict' }),
    /** The guest's own words. Free text, length-capped in the action. */
    message: text().notNull(),
    status: disputeStatusEnum().notNull().default('open'),
    /** Internal resolution notes — never shown to the guest. */
    adminNotes: text(),
    /**
     * Whole-SAR refund granted as part of resolving this dispute (the
     * dispute→refund linkage). Null = resolved without a refund. Money
     * truth stays in payment_events / the booking's own fields — this
     * is the audit stamp of what the resolving admin granted.
     */
    resolutionRefundSar: integer(),
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
    // One OPEN dispute per booking — the DB-level backstop for the
    // check-then-insert in createDispute (two tabs / a network retry
    // would otherwise both pass the pre-check).
    uniqueIndex('disputes_one_open_per_booking')
      .on(t.bookingId)
      .where(sql`status = 'open'`),
  ],
);

/**
 * OTP throttle events (2026-07 audit M2). The browser cooldown cookie is
 * trivially discarded by an attacker, so sends and failed verifies are
 * counted server-side per identifier and per IP
 * (features/auth/lib/throttle.ts). Append-only and small: rows outside
 * the widest counting window are dead weight only — pruned daily past
 * 24h by the release-holds cron (Pass 7, 2026-07-28 audit).
 */
export const authThrottleEvents = pgTable(
  'auth_throttle_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Canonical sign-in identifier: E.164 phone or lowercased email. */
    identifier: text().notNull(),
    /** First-hop client IP; null when no proxy header is present. */
    ip: text(),
    kind: authThrottleKindEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Both throttle counts are `WHERE <key> = ? AND created_at >= ?`.
    index('auth_throttle_identifier_idx').on(t.identifier, t.createdAt),
    index('auth_throttle_ip_idx')
      .on(t.ip, t.createdAt)
      .where(sql`ip IS NOT NULL`),
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

/**
 * Clawbacks: the reversing entry for a refund issued AFTER the host was
 * already paid out for the booking (audit fix 2026-07-20 — previously
 * the guest was refunded, the host kept the payout, and the loss was
 * recorded nowhere). One row per refunded-after-payout booking, amount =
 * the payout share that booking contributed to its batch. Pending rows
 * (`settled_payout_id` null) are deducted from the host's next "Mark
 * paid" batch; the batch that absorbed the deduction is stamped here so
 * the deduction itself is auditable. Append-only like the ledgers.
 */
export const payoutClawbacks = pgTable(
  'payout_clawbacks',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** The refunded booking. Unique — a booking can be clawed back once. */
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id, { onDelete: 'restrict' }),
    /** The payout batch that originally paid this booking to the host. */
    payoutId: uuid()
      .notNull()
      .references(() => payouts.id, { onDelete: 'restrict' }),
    /** Whole SAR owed back by the host (the booking's payout share). Positive. */
    amountSar: integer().notNull(),
    reason: text().notNull(),
    /** The later payout batch whose total this clawback was deducted from. */
    settledPayoutId: uuid().references(() => payouts.id, { onDelete: 'restrict' }),
    settledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Pending-deduction lookup per host, and the admin timeline.
    index('payout_clawbacks_host_idx').on(t.hostId, t.createdAt),
    check('payout_clawbacks_amount_positive', sql`amount_sar > 0`),
  ],
);

/**
 * Gharmish Credit entry kinds. The full lifecycle ships in the enum up
 * front so later phases (checkout redemption, refund-to-credit, expiry
 * sweep) never need an ALTER TYPE on a hot table — P0 writes only
 * `goodwill` and `admin_adjustment`.
 */
export const walletEntryTypeEnum = pgEnum('wallet_entry_type', [
  'refund_credit',
  'goodwill',
  'promo',
  'redemption',
  'expiry',
  'admin_adjustment',
  'reversal',
]);

/**
 * Append-only Gharmish Credit ledger. Never UPDATE or DELETE rows —
 * the balance is always SUM(amount_sar) per guest, and each row is its
 * own audit record (actor, note, timestamp). Credit here is
 * platform-issued and non-withdrawable: guests can never deposit or
 * cash out, which is what keeps this outside SAMA stored-value
 * licensing. ONE owner-blessed exception (2026-07-19): `refund_credit`
 * from the guest's OWN captured payment may travel back to the original
 * payment method via the refund-out flow — refund-to-source only,
 * capped at the card-charged amount, never a transfer to an arbitrary
 * account. Goodwill/promo credit stays non-withdrawable. Written by
 * features/wallet/ledger.ts only.
 */
export const walletLedger = pgTable(
  'wallet_ledger',
  {
    id: uuid().defaultRandom().primaryKey(),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: 'restrict' }),
    type: walletEntryTypeEnum().notNull(),
    /** Whole SAR. Positive = credit, negative = debit; never zero (SQL CHECK). */
    amountSar: integer().notNull(),
    /** Auth user id of the admin actor; null for guest/system flows. Not a FK — mirrors payment_events. */
    actorUserId: text(),
    note: text(),
    /** Credit-lot expiry. Recorded from P0, enforced once redemption/sweep ship. */
    expiresAt: timestamp({ withTimezone: true }),
    bookingId: uuid().references(() => bookings.id, { onDelete: 'restrict' }),
    disputeId: uuid().references(() => disputes.id, { onDelete: 'restrict' }),
    /**
     * Dedupe for at-most-once issuance: admin forms send a per-render
     * uuid; later system flows use deterministic keys ('refund:<bookingId>').
     */
    idempotencyKey: text().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Balance (SUM per guest) and the newest-first admin listing are
    // both left-anchored on this one index.
    index('wallet_ledger_guest_idx').on(t.guestId, t.createdAt),
    // The comment above promised this CHECK long before it existed —
    // codified for real in the 2026-07-20 audit remediation.
    check('wallet_ledger_amount_nonzero', sql`amount_sar <> 0`),
  ],
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
  // Composite PK (applied live 2026-07-28, audit): the pair was only a
  // UNIQUE before — a PK-less table blocks logical replication and some
  // tooling; the redundant unique constraint was dropped with it.
  (t) => [primaryKey({ columns: [t.guestId, t.experienceId] })],
);

/**
 * Operating-cities registry (owner request 2026-07-08). `city` on
 * hosts / experiences / host_applications stays a plain text column —
 * this table is the admin-managed list of cities the marketplace
 * operates in: which values the experience-form pickers offer, plus
 * the bilingual display names the coverage view groups by. `enabled`
 * gates NEW supply only; disabling a city never hides experiences
 * that are already live there. Rows are matched to the text columns
 * by exact `nameEn`, so the pickers are what keep the data clean.
 */
export const cities = pgTable('cities', {
  id: uuid().defaultRandom().primaryKey(),
  /** Stable identifier, e.g. `abha`, `rijal-almaa`. */
  slug: text().notNull().unique(),
  /** Canonical English name — the value stored on `experiences.city`. */
  nameEn: text().notNull().unique(),
  nameAr: text().notNull(),
  region: text().notNull().default('Aseer'),
  /** Offered to hosts/admins for new experiences when true. */
  enabled: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Funnel event kinds — see `analyticsEvents`. */
export const analyticsEventTypeEnum = pgEnum('analytics_event_type', [
  /** An experience detail page was served. */
  'experience_view',
  /** The catalog was served with filters/search applied; `resultCount` says how much supply matched. */
  'search',
]);

/**
 * Lean first-party funnel events (owner-approved P0: the dashboard was
 * blind above the booking request). Append-only, written fire-and-forget
 * from server renders via `after()` — a failed insert never slows or
 * breaks a page. Deliberately NO user identifiers, no IP, no session id:
 * nothing here is PII, so the cookie-notice promise ("no tracking
 * cookies, ever") holds. Bot traffic is not filtered at write time;
 * dashboard queries can add UA heuristics later if noise demands it.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    type: analyticsEventTypeEnum().notNull(),
    /** The experience viewed; null for `search` events. */
    experienceId: uuid().references(() => experiences.id, { onDelete: 'cascade' }),
    locale: text(),
    /** UTM triplet from the request URL, when present (paid/social traffic). */
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    /** `search` events: the normalized filter/query string, e.g. `q=diving&city=Jeddah`. */
    searchQuery: text(),
    /** `search` events: experiences matched. 0 = demand we couldn't serve. */
    resultCount: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dashboard aggregations: per-type counts and per-experience views, windowed.
    index('analytics_events_type_created_idx').on(t.type, t.createdAt),
    index('analytics_events_experience_idx')
      .on(t.experienceId, t.createdAt)
      .where(sql`experience_id IS NOT NULL`),
  ],
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
  /**
   * VAT collection switch. OFF until Gharmish crosses the ZATCA mandatory
   * registration threshold (375,000 SAR taxable turnover over 12 months)
   * and actually registers — while off, no guest surface may mention VAT
   * (disclosing VAT unregistered is a ZATCA violation). Turning it on
   * does NOT change customer prices: listed prices stay VAT-inclusive and
   * the rate is carved out of the same total, stamped per booking at
   * payment settlement.
   */
  vatEnabled: boolean().notNull().default(false),
  /** VAT rate in basis points (KSA standard rate 15% = 1500). */
  vatRateBps: integer().notNull().default(1500),
  /** ZATCA VAT registration number (15 digits) — required to enable VAT. */
  vatRegistrationNumber: text(),
  /**
   * Estimated blended acquiring cost (HyperPay MDR across Mada/Visa/MC)
   * in basis points of the charged amount. REPORTING ESTIMATE ONLY —
   * never touches guest pricing, host payouts, or invoices; the admin
   * dashboard uses it to show commission net of gateway fees so margin
   * decisions aren't made on gross numbers (audit fix 2026-07-20).
   * 0 = not configured; the dashboard hides the estimate.
   */
  gatewayFeeBps: integer().notNull().default(0),
  /**
   * When the cron last alerted the team that rolling-12-month turnover
   * crossed 90% of the ZATCA mandatory-registration threshold. De-dups
   * the alert to once per 30 days. Null = never alerted.
   */
  vatThresholdAlertedAt: timestamp({ withTimezone: true }),
  /** Categories currently bookable/visible. Subset of the `category` enum. */
  enabledCategories: categoryEnum()
    .array()
    .notNull()
    .default(
      sql`ARRAY['nature','heritage','food','wellness','adventure','family','women_only']::category[]`,
    ),
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

export const promoDiscountTypeEnum = pgEnum('promo_discount_type', ['percent', 'fixed']);

/**
 * Admin-managed checkout discount codes. A guest enters a code on the
 * payment step; a valid one reduces the booking's charged total and is
 * SNAPSHOTTED onto the booking (`bookings.promo_code` / `discount_sar`).
 *
 * Redemption counting is DERIVED from bookings (count of live bookings
 * referencing the code), never a counter column here — the same
 * anti-drift stance the capacity math takes. Codes are stored UPPERCASE
 * and matched case-insensitively (the app upper-cases before lookup).
 * A code with redemptions is deactivated, never deleted, so booking
 * history keeps a live FK where possible.
 */
export const promoCodes = pgTable(
  'promo_codes',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Stored UPPERCASE; the unique constraint is the case-folded identity. */
    code: text().notNull().unique(),
    /** Internal admin note (e.g. "Eid launch — IG story"). Never shown to guests. */
    label: text(),
    discountType: promoDiscountTypeEnum().notNull(),
    /**
     * `percent`: whole 1–100 (% off the pre-discount total).
     * `fixed`: whole SAR off the total.
     * The applied amount is always clamped so the charged total stays ≥ 1 SAR.
     */
    discountValue: integer().notNull(),
    /** Minimum pre-discount total (SAR) for the code to apply. Null = no minimum. */
    minTotalSar: integer(),
    /** Cap on total live redemptions across all guests. Null = unlimited. */
    maxRedemptions: integer(),
    /**
     * Cap on live redemptions PER GUEST. Null = unlimited. Defaults to 1
     * (audit fix 2026-07-20): discounts are platform-funded — the host is
     * paid full price — so without a per-guest cap a single account could
     * farm one code across unlimited bookings, each a direct platform
     * cash cost. Admins raise it deliberately for multi-use campaigns.
     */
    maxRedemptionsPerGuest: integer().default(1),
    /** Validity window (inclusive). A null bound is open-ended on that side. */
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    /** Master switch — deactivating retires a code without deleting its history. */
    active: boolean().notNull().default(true),
    /** Admin auth user id of the creator (not a FK — mirrors `updatedByAdminId`). */
    createdByAdminId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The redemption/apply path filters on `active` first.
    index('promo_codes_active_idx').on(t.active),
  ],
);

/**
 * Append-only audit log of admin edits to a person's profile
 * (guest and/or host). Mirrors the other event tables (host status,
 * IBAN, application) — newest row tells the story. One row PER CHANGED
 * FIELD so the admin User-360 timeline renders a clean old→new diff.
 *
 * A person's identity is fragmented across `guests` (authUserId text),
 * `hosts` (userId uuid) and `host_applications` (userId uuid); the same
 * Supabase account can be both a guest and a host. We therefore anchor
 * each row with whichever ids are known — `subjectAuthUserId` for a
 * real account, plus the concrete `subjectGuestId` / `subjectHostId`
 * of the row that was edited — and the detail query matches on any of
 * them.
 *
 * Sensitive values (IBAN, national ID, CR, phone, email) are stored
 * MASKED, never in the clear: the point is a tamper-evident trail of
 * WHAT changed and by whom, not a second copy of the raw PII.
 */
export const userProfileEvents = pgTable(
  'user_profile_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Supabase auth id of the edited person, when they have an account. */
    subjectAuthUserId: text(),
    subjectGuestId: uuid().references(() => guests.id, { onDelete: 'set null' }),
    subjectHostId: uuid().references(() => hosts.id, { onDelete: 'set null' }),
    /** Supabase auth id of the admin who made the change. */
    actorUserId: text().notNull(),
    /** Dotted field key, e.g. `guest.name`, `host.payoutIban`. */
    field: text().notNull(),
    /** Prior value, masked for sensitive fields; null when it was unset. */
    previousValue: text(),
    /** New value, masked for sensitive fields; null when cleared. */
    newValue: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_profile_events_guest_idx').on(t.subjectGuestId, t.createdAt),
    index('user_profile_events_host_idx').on(t.subjectHostId, t.createdAt),
    index('user_profile_events_auth_idx').on(t.subjectAuthUserId, t.createdAt),
  ],
);

/**
 * Delivery ledger — one row per (message, channel) attempt, written by
 * the notification dispatcher (lib/notifications/dispatch.ts) BEFORE
 * calling the provider. The `(dedupeKey, channel)` unique constraint is
 * the idempotency point: the dispatcher claims by inserting with
 * ON CONFLICT DO NOTHING, so double-fired flows (payment return route +
 * HyperPay webhook, hourly cron re-runs) can never double-send. Replaces
 * fire-and-forget over time — every send becomes observable, and
 * provider webhooks (Twilio status callbacks) upgrade `sent` rows to
 * `delivered`/`read`/`failed` by `providerMessageId`.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid().defaultRandom().primaryKey(),
    /**
     * Idempotency key for this logical message, e.g.
     * `booking_confirmed:GH-7K3M9X`. Unique per channel — the same
     * logical message may go out on both email and WhatsApp.
     */
    dedupeKey: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    /**
     * Notification type slug, e.g. `booking_confirmed`,
     * `booking_reminder_24h`, `host_new_booking`. Plain text (not an
     * enum) so adding a type never needs a migration.
     */
    type: text().notNull(),
    /** Who this went to: `guest` / `host` / `applicant` / `admin`. */
    recipientType: text().notNull(),
    /** Channel address: email address or E.164 phone. For the audit trail. */
    recipient: text().notNull(),
    /** The booking this message is about, when there is one. */
    bookingId: uuid().references(() => bookings.id, { onDelete: 'set null' }),
    locale: localeEnum(),
    status: notificationStatusEnum().notNull().default('queued'),
    /**
     * Provider send attempts on this row. 1 on the first claim; the
     * retry sweep (release-holds cron) re-claims a `failed` row —
     * status back to `queued`, attempts + 1 — up to `MAX_SEND_ATTEMPTS`
     * (lib/notifications/ledger.ts), so a transient provider outage
     * heals itself while a hard reject can never loop forever.
     */
    attempts: integer().notNull().default(1),
    /** Provider message id (Twilio Message SID / Resend email id). */
    providerMessageId: text(),
    /** Provider error detail on failure (result code / HTTP body slice). */
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When the provider accepted the message. Null while queued/failed. */
    sentAt: timestamp({ withTimezone: true }),
    /** Last webhook-driven status change (delivered/read/failed). */
    statusUpdatedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // THE dedupe point — see the table comment.
    unique('notification_deliveries_dedupe_channel_uq').on(t.dedupeKey, t.channel),
    // Twilio status callbacks look rows up by Message SID.
    index('notification_deliveries_provider_idx')
      .on(t.providerMessageId)
      .where(sql`provider_message_id IS NOT NULL`),
    // Per-booking notification timeline (admin/debug surfaces).
    index('notification_deliveries_booking_idx')
      .on(t.bookingId, t.createdAt)
      .where(sql`booking_id IS NOT NULL`),
    // Ops queries: recent failures, per-type volumes.
    index('notification_deliveries_status_created_idx').on(t.status, t.createdAt),
  ],
);

/**
 * Do-not-contact list, per channel. A row here makes the dispatcher
 * record `suppressed` instead of sending — checked before EVERY send,
 * transactional included (a WhatsApp STOP is a legal opt-out, not a
 * preference). Written by the Twilio inbound webhook (STOP keywords),
 * and manually by admins; future Resend bounce/complaint webhooks land
 * here too. Addresses are stored canonical: lowercased email, E.164
 * phone.
 */
export const notificationSuppressions = pgTable(
  'notification_suppressions',
  {
    id: uuid().defaultRandom().primaryKey(),
    channel: notificationChannelEnum().notNull(),
    /** Canonical address: lowercased email or E.164 phone. */
    address: text().notNull(),
    /** Why: `stop` (reply keyword), `bounce`, `complaint`, `manual`. */
    reason: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('notification_suppressions_channel_address_uq').on(t.channel, t.address)],
);

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

export const hostApplicationsRelations = relations(hostApplications, ({ many }) => ({
  documents: many(hostApplicationDocuments),
}));

export const hostApplicationDocumentsRelations = relations(hostApplicationDocuments, ({ one }) => ({
  application: one(hostApplications, {
    fields: [hostApplicationDocuments.applicationId],
    references: [hostApplications.id],
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
  promo: one(promoCodes, { fields: [bookings.promoCodeId], references: [promoCodes.id] }),
}));

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  bookings: many(bookings),
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
export type WalletLedgerEntry = typeof walletLedger.$inferSelect;
export type NewWalletLedgerEntry = typeof walletLedger.$inferInsert;
export type PromoCode = typeof promoCodes.$inferSelect;
export type NewPromoCode = typeof promoCodes.$inferInsert;
export type UserProfileEvent = typeof userProfileEvents.$inferSelect;
export type NewUserProfileEvent = typeof userProfileEvents.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type NotificationSuppression = typeof notificationSuppressions.$inferSelect;
export type NewNotificationSuppression = typeof notificationSuppressions.$inferInsert;
