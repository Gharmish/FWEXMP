-- Add hosts.slug as a stable, unique URL slug.
-- Three-step so it is safe on a populated table: add nullable, backfill
-- from the name (ASCII kebab, matching features/hosts/lib/slug.ts), then
-- enforce NOT NULL + UNIQUE.
ALTER TABLE "hosts" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "hosts"
SET "slug" = lower(trim(both '-' from regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')));--> statement-breakpoint
-- Fallback for any name that slugifies to empty (e.g. Arabic-only).
UPDATE "hosts" SET "slug" = 'host-' || left("id"::text, 8) WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
ALTER TABLE "hosts" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_slug_unique" UNIQUE("slug");
