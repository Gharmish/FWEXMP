CREATE TYPE "public"."host_status_event" AS ENUM('suspended', 'restored');--> statement-breakpoint
CREATE TABLE "host_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"event" "host_status_event" NOT NULL,
	"reviewer_user_id" uuid,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_status_events" ADD CONSTRAINT "host_status_events_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;