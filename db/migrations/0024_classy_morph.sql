ALTER TYPE "public"."category" ADD VALUE 'women_only';--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"region" text DEFAULT 'Asir' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug"),
	CONSTRAINT "cities_nameEn_unique" UNIQUE("name_en")
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ALTER COLUMN "enabled_categories" SET DEFAULT ARRAY['nature','heritage','food','wellness','adventure','family','women_only']::category[];