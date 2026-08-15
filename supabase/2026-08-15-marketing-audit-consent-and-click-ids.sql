-- Applied to prod via Supabase MCP `apply_migration` on 2026-08-15
-- (migration name: marketing_audit_consent_and_click_ids).
-- Marketing-audit remediation: additive columns only, no data change.
--
-- bookings.gclid/ttclid/fbclid — ad-platform click ids captured with the
--   existing first-touch UTM triplet (sessionStorage, no cookie). Auto-tagged
--   landings often carry ONLY a click id; offline conversion upload to
--   Google/TikTok is impossible without storing it.
-- bookings.marketing_consent — snapshot of the (unchecked-by-default)
--   marketing-consent checkbox on that booking's form.
-- guests.marketing_consent_at — durable per-guest grant; null = never
--   granted (no marketing messages). Cleared on opt-out so revocation sticks.

alter table bookings add column if not exists gclid text;
alter table bookings add column if not exists ttclid text;
alter table bookings add column if not exists fbclid text;
alter table bookings add column if not exists marketing_consent boolean not null default false;
alter table guests add column if not exists marketing_consent_at timestamptz;
