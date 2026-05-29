ALTER TABLE "bookings" ADD COLUMN "host_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;