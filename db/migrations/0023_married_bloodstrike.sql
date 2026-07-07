CREATE TYPE "public"."host_document_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."host_document_type" AS ENUM('national_id', 'cr_certificate', 'tourism_license', 'signatory_id', 'vat_certificate', 'iban_letter');--> statement-breakpoint
CREATE TABLE "host_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "host_document_type" NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "host_document_status" DEFAULT 'pending' NOT NULL,
	"reviewer_notes" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_application_documents_application_type_uq" UNIQUE("application_id","type")
);
--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "bank_account_holder" text;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "host_applications" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "host_application_documents" ADD CONSTRAINT "host_application_documents_application_id_host_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."host_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_application_documents_application_idx" ON "host_application_documents" USING btree ("application_id");