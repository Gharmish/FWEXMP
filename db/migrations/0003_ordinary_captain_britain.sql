CREATE TYPE "public"."host_application_event" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "host_application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event" "host_application_event" NOT NULL,
	"reviewer_user_id" uuid,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_application_events" ADD CONSTRAINT "host_application_events_application_id_host_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."host_applications"("id") ON DELETE cascade ON UPDATE no action;