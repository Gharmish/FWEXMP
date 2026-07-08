CREATE TYPE "public"."analytics_event_type" AS ENUM('experience_view', 'search');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"experience_id" uuid,
	"locale" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"search_query" text,
	"result_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_type_created_idx" ON "analytics_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_experience_idx" ON "analytics_events" USING btree ("experience_id","created_at") WHERE experience_id IS NOT NULL;