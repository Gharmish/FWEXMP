-- VAT toggle + per-booking snapshot (2026-07-07).
-- NOTE: drizzle-kit generate also emitted pre-existing drift statements
-- (payment_events/payouts/etc. — see memory drizzle-push-drift); those
-- objects already exist in the live DB and were trimmed from this file.
-- Only the genuinely new VAT DDL below was applied (via Supabase MCP).
ALTER TABLE "bookings" ADD COLUMN "vat_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vat_registration_number" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "vat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "vat_rate_bps" integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "vat_registration_number" text;
