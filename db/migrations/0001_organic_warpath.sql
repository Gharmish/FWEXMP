CREATE TYPE "public"."host_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."host_identity_type" AS ENUM('national_id', 'cr');--> statement-breakpoint
CREATE TYPE "public"."experience_moderation_event" AS ENUM('submitted', 'approved', 'rejected', 'changes_requested');--> statement-breakpoint
ALTER TYPE "public"."experience_status" ADD VALUE 'pending_review' BEFORE 'live';--> statement-breakpoint
ALTER TYPE "public"."experience_status" ADD VALUE 'changes_requested' BEFORE 'live';--> statement-breakpoint
CREATE TABLE "experience_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" uuid NOT NULL,
	"event" "experience_moderation_event" NOT NULL,
	"from_status" "experience_status" NOT NULL,
	"to_status" "experience_status" NOT NULL,
	"reviewer_user_id" uuid,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"display_name" text NOT NULL,
	"bio_en" text NOT NULL,
	"bio_ar" text,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"identity_type" "host_identity_type" NOT NULL,
	"identity_number" text NOT NULL,
	"city" text DEFAULT 'Abha' NOT NULL,
	"region" text DEFAULT 'Asir' NOT NULL,
	"status" "host_application_status" DEFAULT 'pending' NOT NULL,
	"reviewer_notes" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"host_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_applications_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "hero_image" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "images" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "experience_moderation_events" ADD CONSTRAINT "experience_moderation_events_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_applications" ADD CONSTRAINT "host_applications_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_userId_unique" UNIQUE("user_id");