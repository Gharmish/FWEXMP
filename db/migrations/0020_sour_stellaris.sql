ALTER TYPE "public"."booking_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "approval_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "approval_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "approval_payment_window_hours" integer DEFAULT 24 NOT NULL;