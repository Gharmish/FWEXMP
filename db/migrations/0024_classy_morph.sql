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
-- The default names the enum value added at the top of this file. Postgres
-- refuses to *use* a value added by ALTER TYPE ... ADD VALUE until the
-- transaction that added it commits ("unsafe use of new value"), and
-- `pnpm db:migrate` runs every pending migration in ONE transaction — so a
-- fresh database died here (CI e2e-db, 2026-09-13). Casting the literals
-- through text[] stores the same default but defers the enum lookup to
-- INSERT time, by which point the value is committed. Production already
-- carries the plain ARRAY[...]::category[] form; same values.
ALTER TABLE "platform_settings" ALTER COLUMN "enabled_categories" SET DEFAULT (ARRAY['nature','heritage','food','wellness','adventure','family','women_only']::text[])::category[];