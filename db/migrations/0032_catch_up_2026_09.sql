-- 0032 — catch-up migration (2026-09-11, engineering audit DATA-01;
-- rebuilt 2026-09-13 after the first CI e2e-db run).
--
-- The Drizzle journal stopped at 0031 (2026-08-02) while the schema kept
-- moving: every DDL change from then until 2026-08-23 was applied to
-- production through the Supabase MCP and recorded, at best, as the ad-hoc
-- files in supabase/*.sql or as prose in docs/. Worse, several earlier
-- hand-applied changes (2026-07: cancellation tiers, promo codes, wallet
-- ledger, notifications, payouts, payment events, user-profile events, the
-- 32 bookings columns of the July audits, …) had made it into the
-- *_snapshot.json files but never into the *.sql files, so replaying the
-- journal on an empty database died at this file with
-- `type "cancellation_tier" does not exist`.
--
-- This body is therefore NOT a snapshot-to-snapshot diff. It is the DDL from
-- the state the journal's SQL actually produces at 0031 (replayed on PGlite,
-- introspected with `drizzle-kit pull`) to the schema the 0032 snapshot
-- describes (`drizzle-kit generate` against db/schema.ts at that commit),
-- minus the introspection artefacts (17 index drop/re-create pairs, array
-- defaults, one truncated constraint name). A fresh database that replays
-- 0000–0036 now matches the 0036 snapshot column for column, index for
-- index, constraint for constraint (scratchpad `compare2.mjs`, 0 problems)
-- and CI's e2e-db job can migrate + seed.
--
-- ALREADY APPLIED IN PRODUCTION (journal row 1789126882020; its hash was
-- updated to this file's sha256 on 2026-09-13). Do not run it against the
-- live database. Two live tables are intentionally outside Drizzle:
-- experience_photos_quarantine_20260815 (2026-08-15 photo quarantine) and
-- backend_watchdog_log (pg_cron stuck-backend watchdog audit trail,
-- supabase/2026-08-21-stuck-backend-watchdog.sql). Production also differs
-- from a fresh replay in ways the app never depends on (read-only catalog
-- diff, scratchpad compare-prod.mjs, 2026-09-13): the hand-applied July
-- tables carry postgres-generated constraint names (…_fkey, …_key,
-- saved_experiences_pkey — same columns and actions), guests.referral_code
-- is unique through the index guests_referral_code_uq instead of the
-- constraint, host_applications.user_id has an extra unique constraint,
-- six extra hand-made indexes exist, and bookings.reference_code has a
-- DB-side default gen_booking_reference_code() (the app always supplies
-- the code). Every ON CONFLICT target in the code maps to a unique
-- constraint or index that this journal creates.
--
-- A fresh environment must ALSO run the RLS block at the end of this file,
-- which drizzle-kit does not generate.

CREATE TYPE "public"."auth_throttle_kind" AS ENUM('send', 'verify_failed', 'promo_attempt');--> statement-breakpoint
CREATE TYPE "public"."cancellation_tier" AS ENUM('flexible', 'moderate', 'strict');--> statement-breakpoint
CREATE TYPE "public"."conversation_author" AS ENUM('guest', 'agent', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conversation_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."conversation_state" AS ENUM('bot', 'human', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('checkout_created', 'checkout_superseded', 'settle_succeeded', 'settle_failed', 'refund_attempted', 'refund_succeeded', 'refund_failed', 'manual_refund_recorded', 'terms_accepted');--> statement-breakpoint
CREATE TYPE "public"."promo_discount_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_category" AS ENUM('refund_exception', 'payment_issue', 'safety_incident', 'host_no_show', 'guest_complaint', 'host_request', 'account', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('urgent', 'high', 'normal');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'waiting_guest', 'waiting_admin', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "public"."wallet_entry_type" AS ENUM('refund_credit', 'goodwill', 'promo', 'redemption', 'expiry', 'admin_adjustment', 'reversal');--> statement-breakpoint
ALTER TYPE "public"."analytics_event_type" ADD VALUE 'page_view';--> statement-breakpoint
ALTER TYPE "public"."cancellation_kind" ADD VALUE 'host';--> statement-breakpoint
CREATE TABLE "admin_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_totp_factors" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_throttle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"ip" text,
	"kind" "auth_throttle_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"tier" "cancellation_tier" PRIMARY KEY NOT NULL,
	"free_cancel_hours" integer NOT NULL,
	"partial_refund_hours" integer NOT NULL,
	"partial_refund_bps" integer NOT NULL,
	"reschedule_cutoff_hours" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_admin_id" text
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "conversation_direction" NOT NULL,
	"author" "conversation_author" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"media_url" text,
	"media_content_type" text,
	"provider_message_id" text,
	"delivery_id" uuid,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "conversation_channel" DEFAULT 'whatsapp' NOT NULL,
	"address" text NOT NULL,
	"guest_id" uuid,
	"host_id" uuid,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"state" "conversation_state" DEFAULT 'human' NOT NULL,
	"profile_name" text,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"last_ack_at" timestamp with time zone,
	"agent_lock_until" timestamp with time zone,
	"identity_verified_at" timestamp with time zone,
	"identity_verified_guest_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_channel_address_uq" UNIQUE("channel","address")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"type" text NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient" text NOT NULL,
	"booking_id" uuid,
	"locale" "locale",
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"status_updated_at" timestamp with time zone,
	CONSTRAINT "notification_deliveries_dedupe_channel_uq" UNIQUE("dedupe_key","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_suppressions_channel_address_uq" UNIQUE("channel","address")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" "payment_event_type" NOT NULL,
	"amount_sar" integer,
	"gateway_id" text,
	"result_code" text,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_clawbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"amount_sar" integer NOT NULL,
	"reason" text NOT NULL,
	"settled_payout_id" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_clawbacks_bookingId_unique" UNIQUE("booking_id"),
	CONSTRAINT "payout_clawbacks_amount_positive" CHECK (amount_sar > 0)
);
--> statement-breakpoint
CREATE TABLE "payout_iban_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"previous_iban_masked" text,
	"new_iban_masked" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"amount_sar" integer NOT NULL,
	"booking_count" integer NOT NULL,
	"payout_iban" text,
	"bank_reference" text,
	"marked_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"discount_type" "promo_discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"min_total_sar" integer,
	"max_redemptions" integer,
	"max_redemptions_per_guest" integer DEFAULT 1,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "support_ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"conversation_id" uuid,
	"booking_id" uuid,
	"guest_id" uuid,
	"category" "support_ticket_category" DEFAULT 'other' NOT NULL,
	"priority" "support_ticket_priority" DEFAULT 'normal' NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"opened_by" text DEFAULT 'agent' NOT NULL,
	"assignee_user_id" uuid,
	"sla_due_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "user_profile_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_auth_user_id" text,
	"subject_guest_id" uuid,
	"subject_host_id" uuid,
	"actor_user_id" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text,
	"role" "user_role" NOT NULL,
	"granted_by_user_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"type" "wallet_entry_type" NOT NULL,
	"amount_sar" integer NOT NULL,
	"actor_user_id" text,
	"note" text,
	"expires_at" timestamp with time zone,
	"booking_id" uuid,
	"dispute_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "wallet_ledger_amount_nonzero" CHECK (amount_sar <> 0)
);
--> statement-breakpoint
ALTER TABLE "saved_experiences" DROP CONSTRAINT "saved_experiences_guest_experience_unique";--> statement-breakpoint
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_guest_id_guests_id_fk";
--> statement-breakpoint
ALTER TABLE "experiences" ALTER COLUMN "cancellation_policy" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "saved_experiences" ADD CONSTRAINT "saved_experiences_guest_id_experience_id_pk" PRIMARY KEY("guest_id","experience_id");--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "story_en" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "cancellation_tier" "cancellation_tier" DEFAULT 'moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "inclusions_ar" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "what_to_bring_ar" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "cancellation_policy_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "booking_cutoff_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "host_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "story_en" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "pending_contact_phone" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "pending_contact_phone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_reviews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "referral_reward_sar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "refunds_via_bank_transfer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "gateway_fee_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "blindspot_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "last_cron_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "resolution_refund_sar" integer;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "referrer_host" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "commission_bps" integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "policy_tier" "cancellation_tier" DEFAULT 'moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "free_cancel_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "partial_refund_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "partial_refund_bps" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reschedule_cutoff_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_from_date" date;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_integrity" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "settle_anomaly_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "settle_anomaly_kind" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "ttclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "marketing_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_note" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reference_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_bank_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_iban" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_beneficiary_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_bank_details_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refunded_amount_sar" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "forfeited_sar" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_sar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "created_ip" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_delivery_id_notification_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_identity_verified_guest_id_guests_id_fk" FOREIGN KEY ("identity_verified_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_clawbacks" ADD CONSTRAINT "payout_clawbacks_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_clawbacks" ADD CONSTRAINT "payout_clawbacks_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_clawbacks" ADD CONSTRAINT "payout_clawbacks_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_clawbacks" ADD CONSTRAINT "payout_clawbacks_settled_payout_id_payouts_id_fk" FOREIGN KEY ("settled_payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_iban_events" ADD CONSTRAINT "payout_iban_events_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_events" ADD CONSTRAINT "user_profile_events_subject_guest_id_guests_id_fk" FOREIGN KEY ("subject_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_events" ADD CONSTRAINT "user_profile_events_subject_host_id_hosts_id_fk" FOREIGN KEY ("subject_host_id") REFERENCES "public"."hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_alerts_created_idx" ON "admin_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_throttle_identifier_idx" ON "auth_throttle_events" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "auth_throttle_ip_idx" ON "auth_throttle_events" USING btree ("ip","created_at") WHERE ip IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_provider_uq" ON "conversation_messages" USING btree ("provider_message_id") WHERE provider_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_state_inbound_idx" ON "conversations" USING btree ("state","last_inbound_at");--> statement-breakpoint
CREATE INDEX "conversations_guest_idx" ON "conversations" USING btree ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_provider_idx" ON "notification_deliveries" USING btree ("provider_message_id") WHERE provider_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_booking_idx" ON "notification_deliveries" USING btree ("booking_id","created_at") WHERE booking_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_created_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_booking_idx" ON "payment_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_clawbacks_host_idx" ON "payout_clawbacks" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_iban_events_host_idx" ON "payout_iban_events" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_host_idx" ON "payouts" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "promo_codes_active_idx" ON "promo_codes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_idx" ON "support_ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_sla_idx" ON "support_tickets" USING btree ("status","sla_due_at");--> statement-breakpoint
CREATE INDEX "support_tickets_conversation_idx" ON "support_tickets" USING btree ("conversation_id") WHERE conversation_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_profile_events_guest_idx" ON "user_profile_events" USING btree ("subject_guest_id","created_at");--> statement-breakpoint
CREATE INDEX "user_profile_events_host_idx" ON "user_profile_events" USING btree ("subject_host_id","created_at");--> statement-breakpoint
CREATE INDEX "user_profile_events_auth_idx" ON "user_profile_events" USING btree ("subject_auth_user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_active_uq" ON "user_roles" USING btree ("user_id","role") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "wallet_ledger_guest_idx" ON "wallet_ledger" USING btree ("guest_id","created_at");--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_booking" ON "disputes" USING btree ("booking_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "bookings_contact_phone_idx" ON "bookings" USING btree ("contact_phone") WHERE contact_phone is not null;--> statement-breakpoint
CREATE INDEX "bookings_created_ip_created_at_idx" ON "bookings" USING btree ("created_ip","created_at") WHERE created_ip IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bookings_payment_deadline_idx" ON "bookings" USING btree ("payment_deadline") WHERE payment_deadline IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_referenceCode_unique" UNIQUE("reference_code");--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_referralCode_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK (rating between 1 and 5);
--> statement-breakpoint
-- Row Level Security: on for every table, no policies (deny-by-default via
-- PostgREST; the app's BYPASSRLS role is the only reader/writer). Mirrors
-- production, where every public table has it enabled; harmless to re-run.
ALTER TABLE "admin_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_totp_factors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_throttle_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "experience_moderation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "experiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_application_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_status_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hosts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_suppressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_clawbacks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_iban_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_experiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_profile_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ENABLE ROW LEVEL SECURITY;
