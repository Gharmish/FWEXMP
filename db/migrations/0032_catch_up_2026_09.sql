-- 0032 — catch-up migration (2026-09-11, engineering audit DATA-01).
--
-- The Drizzle journal stopped at 0031 (2026-08-02) while the schema kept
-- moving: between 2026-08-02 and 2026-08-23 every DDL change below was
-- applied to production through the Supabase MCP, recorded (mostly) as the
-- ad-hoc files in supabase/*.sql and, for user_roles / admin_totp_factors /
-- cancellation_policies, only as prose in docs/. This file is `drizzle-kit
-- generate` output from db/schema.ts against the 0031 snapshot, so the
-- repository can once again reproduce the live schema and future
-- `db:generate` runs diff cleanly.
--
-- ALREADY APPLIED IN PRODUCTION. Do not run it against the live database.
-- Verified read-only on 2026-09-11 against project xjgpflzkpydfpuomqhuq:
-- all eight tables, all 34 enum types, the eleven bookings columns and the
-- two guests columns exist (referral_code uniqueness is enforced there by
-- the unique index guests_referral_code_uq rather than the constraint name
-- below — same semantics), and ROW LEVEL SECURITY is enabled on every
-- public table (deny-by-default, no policies; the app connects as a
-- BYPASSRLS role). Two live tables are intentionally outside Drizzle:
-- experience_photos_quarantine_20260815 (2026-08-15 photo quarantine) and
-- backend_watchdog_log (pg_cron stuck-backend watchdog audit trail,
-- supabase/2026-08-21-stuck-backend-watchdog.sql).
--
-- A fresh environment must ALSO run the RLS block at the end of this file,
-- which drizzle-kit does not generate.

CREATE TYPE "public"."conversation_author" AS ENUM('guest', 'agent', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conversation_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."conversation_state" AS ENUM('bot', 'human', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_category" AS ENUM('refund_exception', 'payment_issue', 'safety_incident', 'host_no_show', 'guest_complaint', 'host_request', 'account', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('urgent', 'high', 'normal');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'waiting_guest', 'waiting_admin', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin');--> statement-breakpoint
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
ALTER TABLE "analytics_events" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "referrer_host" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_integrity" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "ttclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "marketing_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_note" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_bank_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_iban" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_beneficiary_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_bank_details_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "story_en" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "story_en" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "pending_contact_phone" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "pending_contact_phone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "notify_reviews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_suppressions" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "referral_reward_sar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "refunds_via_bank_transfer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "host_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_delivery_id_notification_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_identity_verified_guest_id_guests_id_fk" FOREIGN KEY ("identity_verified_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_alerts_created_idx" ON "admin_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_provider_uq" ON "conversation_messages" USING btree ("provider_message_id") WHERE provider_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_state_inbound_idx" ON "conversations" USING btree ("state","last_inbound_at");--> statement-breakpoint
CREATE INDEX "conversations_guest_idx" ON "conversations" USING btree ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_idx" ON "support_ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_sla_idx" ON "support_tickets" USING btree ("status","sla_due_at");--> statement-breakpoint
CREATE INDEX "support_tickets_conversation_idx" ON "support_tickets" USING btree ("conversation_id") WHERE conversation_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_active_uq" ON "user_roles" USING btree ("user_id","role") WHERE revoked_at is null;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_referralCode_unique" UNIQUE("referral_code");

--> statement-breakpoint
-- Row Level Security: on for every table, no policies (deny-by-default via
-- PostgREST; the app's BYPASSRLS role is the only reader/writer). Mirrors
-- production; harmless to re-run.
ALTER TABLE "admin_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_totp_factors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
