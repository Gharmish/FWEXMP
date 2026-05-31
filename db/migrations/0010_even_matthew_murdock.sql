ALTER TABLE "guests" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_authUserId_unique" UNIQUE("auth_user_id");