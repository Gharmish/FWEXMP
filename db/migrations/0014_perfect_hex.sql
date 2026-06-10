CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'processing', 'paid', 'failed');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_brand" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "paid_at" timestamp with time zone;