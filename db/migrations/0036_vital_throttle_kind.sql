-- 2026-09-12 (engineering audit second-pass verification F15): the /api/vitals
-- per-IP ingest cap records one auth_throttle_events row per accepted beacon.
-- Apply BEFORE deploying the code that writes kind = 'vital'.
ALTER TYPE "public"."auth_throttle_kind" ADD VALUE 'vital' BEFORE 'promo_attempt';