CREATE INDEX "bookings_experience_date_status_idx" ON "bookings" USING btree ("experience_id","date","status");--> statement-breakpoint
CREATE INDEX "bookings_guest_idx" ON "bookings" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experience_moderation_events_experience_idx" ON "experience_moderation_events" USING btree ("experience_id","created_at");--> statement-breakpoint
CREATE INDEX "experiences_status_idx" ON "experiences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiences_host_idx" ON "experiences" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "host_application_events_application_idx" ON "host_application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "host_applications_status_idx" ON "host_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "host_status_events_host_idx" ON "host_status_events" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "moments_experience_order_idx" ON "moments" USING btree ("experience_id","order_index");--> statement-breakpoint
CREATE INDEX "reviews_experience_idx" ON "reviews" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "reviews_guest_idx" ON "reviews" USING btree ("guest_id");