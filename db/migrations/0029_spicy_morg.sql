CREATE TYPE "public"."cancellation_kind" AS ENUM('guest', 'operator', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."refund_method" AS ENUM('gateway', 'wallet', 'manual');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_kind" "cancellation_kind";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_method" "refund_method";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "wallet_applied_sar" integer DEFAULT 0 NOT NULL;
