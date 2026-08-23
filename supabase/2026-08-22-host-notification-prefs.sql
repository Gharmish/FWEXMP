-- 2026-08-22: host notification preferences + verified contact-phone change.
-- ALREADY APPLIED to the live gharmish-experiences project via Supabase MCP
-- apply_migration on 2026-08-22; kept here so repo, live schema and the
-- Supabase migration history agree. Idempotent — safe to re-run.
--
--   * hosts.notify_email / notify_whatsapp   — channel toggles (≥1 stays on)
--   * hosts.notify_reminders / notify_reviews — optional-category toggles
--   * hosts.pending_contact_phone(_at)        — a phone change awaiting its
--                                               Twilio Verify code

alter table hosts
  add column if not exists pending_contact_phone text,
  add column if not exists pending_contact_phone_at timestamptz,
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_whatsapp boolean not null default true,
  add column if not exists notify_reminders boolean not null default true,
  add column if not exists notify_reviews boolean not null default true;
