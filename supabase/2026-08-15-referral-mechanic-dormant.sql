-- Applied to prod via Supabase MCP `apply_migration` on 2026-08-15
-- (migration name: referral_mechanic_dormant).
-- Marketing-audit remediation: referral mechanic, DORMANT by default.
--
-- guests.referral_code — the guest's own shareable code (lazily minted).
-- bookings.referral_code — the ?ref= code that referred THIS booking
--   (first-touch sessionStorage capture, like the utm_*/click-id columns).
-- platform_settings.referral_reward_sar — two-sided reward per side in
--   whole SAR, issued as `promo` wallet credit when a referred guest's
--   first booking settles paid. 0 (the default) = codes mint and
--   attribute but NO credit is ever issued — the amount is an owner
--   pricing decision; flip it in platform_settings to launch.

alter table guests add column if not exists referral_code text;
create unique index if not exists guests_referral_code_uq on guests (referral_code);
alter table bookings add column if not exists referral_code text;
alter table platform_settings add column if not exists referral_reward_sar integer not null default 0;
