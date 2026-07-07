ALTER TABLE "bookings" ADD COLUMN "invoice_item_en" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "invoice_item_ar" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "billed_name" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "vat_threshold_alerted_at" timestamp with time zone;