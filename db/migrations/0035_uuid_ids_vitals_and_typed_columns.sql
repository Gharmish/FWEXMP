-- 2026-09 engineering audit, schema batch. Apply BEFORE deploying the code
-- that ships with it (the app writes web_vitals and reads uuid-typed ids).
--   DATA-07: every auth-user-id column becomes uuid (values were verified
--            uuid-shaped in production on 2026-09-11 — the USING casts are
--            lossless).
--   DATA-08: disputes.ticket_id gains its FK (set null on ticket delete).
--   ROADMAP-06: web_vitals table for real-user Core Web Vitals, RLS on,
--            written only by the app role.
-- Typed text columns (admin_alerts.kind, support_ticket_events.kind) and
-- jsonb shapes are TypeScript-only and need no DDL.
CREATE TABLE "web_vitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"value" double precision NOT NULL,
	"rating" text NOT NULL,
	"path" text NOT NULL,
	"locale" text,
	"navigation_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ALTER COLUMN "auth_user_id" SET DATA TYPE uuid USING "auth_user_id"::uuid;--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "actor_user_id" SET DATA TYPE uuid USING "actor_user_id"::uuid;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "marked_by_user_id" SET DATA TYPE uuid USING "marked_by_user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user_profile_events" ALTER COLUMN "subject_auth_user_id" SET DATA TYPE uuid USING "subject_auth_user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user_profile_events" ALTER COLUMN "actor_user_id" SET DATA TYPE uuid USING "actor_user_id"::uuid;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "actor_user_id" SET DATA TYPE uuid USING "actor_user_id"::uuid;--> statement-breakpoint
CREATE INDEX "web_vitals_created_idx" ON "web_vitals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "web_vitals_name_created_idx" ON "web_vitals" USING btree ("name","created_at");--> statement-breakpoint
-- NOT VALID + VALIDATE: the constraint is enforced for new rows immediately and
-- existing rows are checked under a lighter lock — ONLY when the two statements
-- run in separate transactions (e.g. two Supabase apply_migration calls).
-- `pnpm db:migrate` wraps every pending migration in one transaction, so there
-- the split is harmless but buys nothing (second-pass F26, third-round R7).
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action NOT VALID;
ALTER TABLE "disputes" VALIDATE CONSTRAINT "disputes_ticket_id_support_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "web_vitals" ENABLE ROW LEVEL SECURITY;
