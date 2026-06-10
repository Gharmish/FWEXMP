CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'platform' NOT NULL,
	"default_commission_bps" integer DEFAULT 1500 NOT NULL,
	"enabled_categories" "category"[] DEFAULT ARRAY['nature','heritage','food','wellness','adventure','family']::category[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_admin_id" text
);
