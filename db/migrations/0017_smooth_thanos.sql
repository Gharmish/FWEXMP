ALTER TABLE "bookings" ADD COLUMN "refund_due_sar" integer;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "cancellation_window_hours" integer DEFAULT 48 NOT NULL;