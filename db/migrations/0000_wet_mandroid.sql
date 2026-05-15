CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('nature', 'heritage', 'food', 'wellness', 'adventure', 'family');--> statement-breakpoint
CREATE TYPE "public"."experience_status" AS ENUM('draft', 'live', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."host_verification" AS ENUM('pending', 'verified', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"experience_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"party_size" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"payment_reference" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"category" "category" NOT NULL,
	"host_id" uuid NOT NULL,
	"duration_minutes" integer NOT NULL,
	"max_group_size" integer NOT NULL,
	"min_age" integer DEFAULT 0 NOT NULL,
	"price_sar" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"city" text DEFAULT 'Abha' NOT NULL,
	"region" text DEFAULT 'Asir' NOT NULL,
	"place_name" text NOT NULL,
	"inclusions" text[] DEFAULT '{}' NOT NULL,
	"what_to_bring" text[] DEFAULT '{}' NOT NULL,
	"cancellation_policy" text NOT NULL,
	"availability_weekdays" integer[] DEFAULT '{}' NOT NULL,
	"blackout_dates" date[] DEFAULT '{}' NOT NULL,
	"status" "experience_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiences_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"preferred_language" "locale" DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bio_en" text NOT NULL,
	"bio_ar" text NOT NULL,
	"photo_url" text,
	"national_id" text,
	"cr_number" text,
	"verification_status" "host_verification" DEFAULT 'pending' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"payout_iban" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"time_of_day" text,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"photo_url" text
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"experience_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"text_en" text,
	"text_ar" text,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"host_reply" text,
	"editable_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_bookingId_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "saved_experiences" (
	"guest_id" uuid NOT NULL,
	"experience_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_experiences_guest_experience_unique" UNIQUE("guest_id","experience_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_experiences" ADD CONSTRAINT "saved_experiences_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_experiences" ADD CONSTRAINT "saved_experiences_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;