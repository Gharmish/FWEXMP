-- 2026-08-21: manual (bank-transfer) refunds.
-- Owner decision: every refund is wired by hand for now, so the platform
-- collects the guest's payee details and skips the HyperPay refund API.
-- Applied to the live project via Supabase MCP apply_migration.

alter table bookings
  add column if not exists refund_bank_name text,
  add column if not exists refund_iban text,
  add column if not exists refund_beneficiary_name text,
  add column if not exists refund_bank_details_at timestamptz;

alter table platform_settings
  add column if not exists refunds_via_bank_transfer boolean not null default true;
