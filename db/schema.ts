import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
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
]);

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

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'refunded',
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
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const guests = pgTable('guests', {
  id: uuid().defaultRandom().primaryKey(),
  /** Phone is the primary identifier in KSA (BRIEF §8). */
  phone: text().notNull().unique(),
  email: text(),
  name: text().notNull(),
  preferredLanguage: localeEnum().notNull().default('ar'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const experiences = pgTable('experiences', {
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
});

export const moments = pgTable('moments', {
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
});

export const bookings = pgTable('bookings', {
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
  currency: text().notNull().default('SAR'),
  status: bookingStatusEnum().notNull().default('pending'),
  /** Moyasar transaction id, set after payment. */
  paymentReference: text(),
  /** Safe retries for AI agents (BRIEF §6). */
  idempotencyKey: text().notNull().unique(),
  /**
   * When the admin moved this booking to `refunded`. Null for any
   * booking that was never refunded. Analytics windows refunds by
   * this column (so a 60-day-old booking refunded today shows up in
   * `last7d.refunded`); falls back to `createdAt` for legacy rows
   * that were already `refunded` before this column existed.
   */
  refundedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable('reviews', {
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
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

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
export const hostApplications = pgTable('host_applications', {
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
});

/**
 * Moderation event log for experiences. See `moderationEventEnum`.
 * Append-only — newest row tells the story of the current state.
 */
export const experienceModerationEvents = pgTable('experience_moderation_events', {
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
});

/**
 * Append-only audit log of host application decisions. Preserves
 * every submit / approve / reject across resubmission cycles, which
 * `host_applications.reviewerNotes / reviewedAt` would overwrite.
 */
export const hostApplicationEvents = pgTable('host_application_events', {
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
});

/**
 * Append-only audit log of host status changes (suspend / restore).
 * Mirrors `experience_moderation_events`: newest row tells the story.
 */
export const hostStatusEvents = pgTable('host_status_events', {
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
});

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
