-- 2026-09 engineering audit DATA-11: promo redemptions are counted under
-- the promo row's lock; give the count an index. Safe to apply at any time.
CREATE INDEX "bookings_promo_code_idx" ON "bookings" USING btree ("promo_code_id");