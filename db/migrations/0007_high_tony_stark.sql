CREATE TYPE "public"."booking_mode" AS ENUM('request', 'instant');--> statement-breakpoint
ALTER TYPE "public"."experience_moderation_event" ADD VALUE 'edited';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "start_time" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "booking_mode" "booking_mode" DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "commission_bps" integer DEFAULT 1500 NOT NULL;