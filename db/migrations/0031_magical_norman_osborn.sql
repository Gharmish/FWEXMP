-- Booking-step consent evidence (2026-08-02 legal audit).
-- NOTE: db:generate emitted a catch-up diff here (payout_clawbacks,
-- contact_phone, promo caps, CHECKs…) because earlier sessions applied
-- their DDL via Supabase MCP without regenerating drizzle meta. Those
-- statements are already live and were removed from this file; the 0031
-- meta snapshot now matches the real schema, so future generates diff
-- cleanly. Only the four statements below are new — applied live via
-- Supabase MCP apply_migration on 2026-08-02.
ALTER TABLE "bookings" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "women_only_attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "min_age_attested_at" timestamp with time zone;
